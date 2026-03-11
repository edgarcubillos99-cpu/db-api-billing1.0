import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Seguridad: Protege cabeceras HTTP
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: [`'self'`],
          styleSrc: [`'self'`, `'unsafe-inline'`],
          imgSrc: [`'self'`, 'data:', 'validator.swagger.io'],
        },
      },
    }),
  );

  // Seguridad: Habilita CORS
  app.enableCors({
    origin: process.env.FRONTEND_URL || '*', // En producción, cambia '*' por la URL de tu frontend
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // 1. Configuración global de validaciones (Pipes)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // 2. Configuración de Swagger
  const config = new DocumentBuilder()
    .setTitle('Records API')
    .setDescription('API para gestionar y consultar millones de registros transaccionales')
    .setVersion('1.0')
    .build();
    
  // 3. Crear el documento y montar la interfaz gráfica
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document); // 'api' será la ruta en el navegador

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Server is running on port ${port}`);
}
bootstrap();
