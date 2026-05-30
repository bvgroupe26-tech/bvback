import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsString, ValidateNested } from 'class-validator';

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
  @IsString()
  @IsNotEmpty()
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
