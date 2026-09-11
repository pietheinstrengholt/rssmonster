import OpenAI from 'openai';
import { getCompatibleClientOptions } from '../config/config.js';

export const createCompatibleClient = (capability, environment = process.env) =>
  new OpenAI(getCompatibleClientOptions(capability, environment));
