import * as Joi from 'joi';

export const validationSchema = Joi.object({
  JWT_EXPIRES_IN: Joi.string().default('1d'),
});
