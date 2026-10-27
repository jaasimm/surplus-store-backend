const { ApiError } = require('../utils/api');

/**
 * Validate request input with a Zod schema and replace `req[source]`
 * with the parsed (whitelisted, coerced) value. Unknown keys are stripped,
 * which also prevents mass-assignment style attacks.
 *
 *   validate(z.object({ email: z.string().email() }), 'body')
 */
const validate = (schema, source = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    const details = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    return next(ApiError.badRequest(details[0] || 'Invalid input', details));
  }
  req[source] = result.data;
  next();
};

module.exports = { validate };
