import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsString,
  IsUrl,
  registerDecorator,
  ValidateNested,
  ValidationOptions,
} from 'class-validator';

// Évite d'utiliser le serveur comme relais HTTP (SSRF) vers des URL arbitraires.
const PUSH_HOST_PATTERNS: RegExp[] = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /^([a-z0-9-]+\.)*push\.services\.mozilla\.com$/,
  /^([a-z0-9-]+\.)*push\.apple\.com$/,
  /^([a-z0-9-]+\.)*notify\.windows\.com$/,
];

export function isAllowedPushEndpoint(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    return PUSH_HOST_PATTERNS.some((pattern) => pattern.test(host));
  } catch {
    return false;
  }
}

function IsPushServiceEndpoint(options?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'isPushServiceEndpoint',
      target: target.constructor,
      propertyName: propertyName as string,
      options: {
        message: 'endpoint doit être une URL HTTPS d\'un service Web Push reconnu',
        ...options,
      },
      validator: { validate: isAllowedPushEndpoint },
    });
  };
}

export class PushSubscriptionKeysDto {
  @ApiProperty({ description: 'Clé p256dh du navigateur (PushManager.subscribe)' })
  @IsString()
  @IsNotEmpty()
  p256dh!: string;

  @ApiProperty({ description: 'Clé auth du navigateur' })
  @IsString()
  @IsNotEmpty()
  auth!: string;
}

export class SubscribePushDto {
  @ApiProperty({
    example: 'https://fcm.googleapis.com/fcm/send/...',
    description: 'URL endpoint renvoyée par PushManager.subscribe()',
  })
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @IsPushServiceEndpoint()
  endpoint!: string;

  @ApiProperty({ type: PushSubscriptionKeysDto })
  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys!: PushSubscriptionKeysDto;
}

export class UnsubscribePushDto {
  @ApiProperty({
    example: 'https://fcm.googleapis.com/fcm/send/...',
    description: 'Endpoint à retirer pour l\'utilisateur connecté',
  })
  @IsString()
  @IsNotEmpty()
  endpoint!: string;
}

export class ResubscribePushDto {
  @ApiProperty({
    description: 'Ancien endpoint (event.oldSubscription) déjà enregistré en base',
  })
  @IsString()
  @IsNotEmpty()
  oldEndpoint!: string;

  @ApiProperty({ type: SubscribePushDto })
  @ValidateNested()
  @Type(() => SubscribePushDto)
  subscription!: SubscribePushDto;
}
