import { Injectable } from '@nestjs/common';
import { Clock } from '../application/ports.js';

@Injectable()
export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}
