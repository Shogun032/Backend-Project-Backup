import { ApiProperty } from '@nestjs/swagger';
import { BookingStatus } from '@prisma/client';
import { IsEnum, IsString } from 'class-validator';

export class UpdateBookingStatusDto {
  @IsString()
  @IsEnum(BookingStatus)
  @ApiProperty({
    enum: BookingStatus,
    description:
      'Only CANCELLED is permitted for owners, before checkIn. Other recognized statuses return 403 after ownership verification; unknown values return 400.',
  })
  status: BookingStatus;
}
