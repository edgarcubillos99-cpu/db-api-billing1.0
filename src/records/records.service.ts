import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RecordEntity } from './entities/record.entity';
import { GetRecordsFilterDto } from './dto/get-records-filter.dto';
import { UserRole } from '../users/entities/user.entity';

export interface AuthenticatedUser {
  userId: string;
  username: string;
  role: UserRole;
}

@Injectable()
export class RecordsService {
  constructor(
    @InjectRepository(RecordEntity)
    private readonly recordsRepository: Repository<RecordEntity>,
  ) {}

  private applyAgentScope(query: any, currentUser: AuthenticatedUser) {
    if (currentUser.role === UserRole.USER) {
      query.andWhere('record.agent = :scopedAgent', { scopedAgent: currentUser.username });
    }
  }

  async findAll(filters: GetRecordsFilterDto, currentUser: AuthenticatedUser) {
    const { 
      client_id, client, type, agent, date_from, date_to, 
      amount_min, amount_max, limit = 50, page = 1, sort_by = 'created_at', order = 'DESC' 
    } = filters;

    const query = this.recordsRepository.createQueryBuilder('record')
      .select([
        'record.id', 'record.client_id', 'record.client', 'record.date', 
        'record.type', 'record.amount', 'record.agent', 'record.created_at'
      ]);

    this.applyAgentScope(query, currentUser);

    if (client_id) query.andWhere('record.client_id = :client_id', { client_id });
    if (client) query.andWhere('record.client LIKE :client', { client: `%${client}%` });
    if (type) query.andWhere('record.type = :type', { type });
    // Solo aplicar filtro de agent del query param si el usuario es ADMIN
    if (agent && currentUser.role === UserRole.ADMIN) {
      query.andWhere('record.agent = :agent', { agent });
    }
    
    if (date_from) query.andWhere('record.date >= :date_from', { date_from });
    if (date_to) query.andWhere('record.date <= :date_to', { date_to });
    
    if (amount_min) query.andWhere('record.amount >= :amount_min', { amount_min });
    if (amount_max) query.andWhere('record.amount <= :amount_max', { amount_max });

    query.orderBy(`record.${sort_by}`, order)
         .skip((page - 1) * limit)
         .take(limit);

    const [data, total] = await query.getManyAndCount();

    return {
      data,
      meta: {
        total,
        page,
        limit,
        last_page: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, currentUser: AuthenticatedUser) {
    const query = this.recordsRepository.createQueryBuilder('record')
      .where('record.id = :id', { id });

    this.applyAgentScope(query, currentUser);

    const record = await query.getOne();
    if (!record) {
      throw new NotFoundException(`Record with ID ${id} not found`);
    }
    return record;
  }

  // --- AGREGACIONES ---
  async getStatsByClient(currentUser: AuthenticatedUser) {
    const query = this.recordsRepository.createQueryBuilder('record')
      .select('record.client_id', 'client_id')
      .addSelect('record.client', 'client')
      .addSelect('SUM(record.amount)', 'total_amount')
      .addSelect('COUNT(record.id)', 'total_transactions');

    this.applyAgentScope(query, currentUser);

    return query
      .groupBy('record.client_id')
      .addGroupBy('record.client')
      .getRawMany();
  }

  async getStatsByAgent(currentUser: AuthenticatedUser) {
    const query = this.recordsRepository.createQueryBuilder('record')
      .select('record.agent', 'agent')
      .addSelect('SUM(record.amount)', 'total_amount')
      .addSelect('COUNT(record.id)', 'total_transactions');

    this.applyAgentScope(query, currentUser);

    return query.groupBy('record.agent').getRawMany();
  }

  async getAmountSummary(currentUser: AuthenticatedUser, date_from?: string, date_to?: string) {
    const query = this.recordsRepository.createQueryBuilder('record')
      .select('record.type', 'type')
      .addSelect('SUM(record.amount)', 'total_amount');

    this.applyAgentScope(query, currentUser);

    if (date_from) query.andWhere('record.date >= :date_from', { date_from });
    if (date_to) query.andWhere('record.date <= :date_to', { date_to });

    return query.groupBy('record.type').getRawMany();
  }

  async advancedSearch(searchPayload: any, currentUser: AuthenticatedUser) {
    const query = this.recordsRepository.createQueryBuilder('record');

    this.applyAgentScope(query, currentUser);
    
    if (searchPayload.types && searchPayload.types.length > 0) {
      query.andWhere('record.type IN (:...types)', { types: searchPayload.types });
    }

    if (searchPayload.client_ids && searchPayload.client_ids.length > 0) {
      query.andWhere('record.client_id IN (:...client_ids)', { client_ids: searchPayload.client_ids });
    }

    return query.take(100).getMany();
  }
}