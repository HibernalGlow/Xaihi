type Validator = ((...values: unknown[]) => null) & { isRequired: (...values: unknown[]) => null }

const validator = (() => null) as Validator
validator.isRequired = () => null
const validatorFactory = () => validator

const PropTypes = {
  any: validator,
  array: validator,
  arrayOf: validatorFactory,
  bigint: validator,
  bool: validator,
  checkPropTypes: () => {},
  element: validator,
  elementType: validator,
  exact: validatorFactory,
  func: validator,
  instanceOf: validatorFactory,
  node: validator,
  number: validator,
  object: validator,
  objectOf: validatorFactory,
  oneOf: validatorFactory,
  oneOfType: validatorFactory,
  resetWarningCache: () => {},
  shape: validatorFactory,
  string: validator,
  symbol: validator,
}

export const checkPropTypes = PropTypes.checkPropTypes
export const resetWarningCache = PropTypes.resetWarningCache
export default PropTypes
