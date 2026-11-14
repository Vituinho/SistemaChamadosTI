import { Type } from 'class-transformer';
import { IsDefined, IsString, IsUrl, Length, Matches, ValidateNested } from 'class-validator';

const HTTPS_ENDPOINT = { protocols: ['https'], require_protocol: true, require_tld: true, allow_underscores: true };

export class PushEndpointDto {
  @IsString() @Length(20, 2048) @IsUrl(HTTPS_ENDPOINT)
  endpoint!: string;
}

export class PushKeysDto {
  @IsString() @Length(40, 256) @Matches(/^[A-Za-z0-9_\-+/=]+$/)
  p256dh!: string;

  @IsString() @Length(8, 128) @Matches(/^[A-Za-z0-9_\-+/=]+$/)
  auth!: string;
}

export class PushSubscriptionDto extends PushEndpointDto {
  @IsDefined() @ValidateNested() @Type(() => PushKeysDto)
  keys!: PushKeysDto;
}
