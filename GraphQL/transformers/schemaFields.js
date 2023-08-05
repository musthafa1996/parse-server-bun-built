"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.transformToParse = exports.transformToGraphQL = void 0;
var _node = _interopRequireDefault(require("parse/node"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
const transformToParse = (graphQLSchemaFields, existingFields) => {
  if (!graphQLSchemaFields) {
    return {};
  }
  let parseSchemaFields = {};
  const reducerGenerator = type => (parseSchemaFields, field) => {
    if (type === 'Remove') {
      if (existingFields[field.name]) {
        return _objectSpread(_objectSpread({}, parseSchemaFields), {}, {
          [field.name]: {
            __op: 'Delete'
          }
        });
      } else {
        return parseSchemaFields;
      }
    }
    if (graphQLSchemaFields.remove && graphQLSchemaFields.remove.find(removeField => removeField.name === field.name)) {
      return parseSchemaFields;
    }
    if (parseSchemaFields[field.name] || existingFields && existingFields[field.name]) {
      throw new _node.default.Error(_node.default.Error.INVALID_KEY_NAME, `Duplicated field name: ${field.name}`);
    }
    if (type === 'Relation' || type === 'Pointer') {
      return _objectSpread(_objectSpread({}, parseSchemaFields), {}, {
        [field.name]: {
          type,
          targetClass: field.targetClassName
        }
      });
    }
    return _objectSpread(_objectSpread({}, parseSchemaFields), {}, {
      [field.name]: {
        type
      }
    });
  };
  if (graphQLSchemaFields.addStrings) {
    parseSchemaFields = graphQLSchemaFields.addStrings.reduce(reducerGenerator('String'), parseSchemaFields);
  }
  if (graphQLSchemaFields.addNumbers) {
    parseSchemaFields = graphQLSchemaFields.addNumbers.reduce(reducerGenerator('Number'), parseSchemaFields);
  }
  if (graphQLSchemaFields.addBooleans) {
    parseSchemaFields = graphQLSchemaFields.addBooleans.reduce(reducerGenerator('Boolean'), parseSchemaFields);
  }
  if (graphQLSchemaFields.addArrays) {
    parseSchemaFields = graphQLSchemaFields.addArrays.reduce(reducerGenerator('Array'), parseSchemaFields);
  }
  if (graphQLSchemaFields.addObjects) {
    parseSchemaFields = graphQLSchemaFields.addObjects.reduce(reducerGenerator('Object'), parseSchemaFields);
  }
  if (graphQLSchemaFields.addDates) {
    parseSchemaFields = graphQLSchemaFields.addDates.reduce(reducerGenerator('Date'), parseSchemaFields);
  }
  if (graphQLSchemaFields.addFiles) {
    parseSchemaFields = graphQLSchemaFields.addFiles.reduce(reducerGenerator('File'), parseSchemaFields);
  }
  if (graphQLSchemaFields.addGeoPoint) {
    parseSchemaFields = [graphQLSchemaFields.addGeoPoint].reduce(reducerGenerator('GeoPoint'), parseSchemaFields);
  }
  if (graphQLSchemaFields.addPolygons) {
    parseSchemaFields = graphQLSchemaFields.addPolygons.reduce(reducerGenerator('Polygon'), parseSchemaFields);
  }
  if (graphQLSchemaFields.addBytes) {
    parseSchemaFields = graphQLSchemaFields.addBytes.reduce(reducerGenerator('Bytes'), parseSchemaFields);
  }
  if (graphQLSchemaFields.addPointers) {
    parseSchemaFields = graphQLSchemaFields.addPointers.reduce(reducerGenerator('Pointer'), parseSchemaFields);
  }
  if (graphQLSchemaFields.addRelations) {
    parseSchemaFields = graphQLSchemaFields.addRelations.reduce(reducerGenerator('Relation'), parseSchemaFields);
  }
  if (existingFields && graphQLSchemaFields.remove) {
    parseSchemaFields = graphQLSchemaFields.remove.reduce(reducerGenerator('Remove'), parseSchemaFields);
  }
  return parseSchemaFields;
};
exports.transformToParse = transformToParse;
const transformToGraphQL = parseSchemaFields => {
  return Object.keys(parseSchemaFields).map(name => ({
    name,
    type: parseSchemaFields[name].type,
    targetClassName: parseSchemaFields[name].targetClass
  }));
};
exports.transformToGraphQL = transformToGraphQL;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJ0cmFuc2Zvcm1Ub1BhcnNlIiwiZ3JhcGhRTFNjaGVtYUZpZWxkcyIsImV4aXN0aW5nRmllbGRzIiwicGFyc2VTY2hlbWFGaWVsZHMiLCJyZWR1Y2VyR2VuZXJhdG9yIiwidHlwZSIsImZpZWxkIiwibmFtZSIsIl9fb3AiLCJyZW1vdmUiLCJmaW5kIiwicmVtb3ZlRmllbGQiLCJQYXJzZSIsIkVycm9yIiwiSU5WQUxJRF9LRVlfTkFNRSIsInRhcmdldENsYXNzIiwidGFyZ2V0Q2xhc3NOYW1lIiwiYWRkU3RyaW5ncyIsInJlZHVjZSIsImFkZE51bWJlcnMiLCJhZGRCb29sZWFucyIsImFkZEFycmF5cyIsImFkZE9iamVjdHMiLCJhZGREYXRlcyIsImFkZEZpbGVzIiwiYWRkR2VvUG9pbnQiLCJhZGRQb2x5Z29ucyIsImFkZEJ5dGVzIiwiYWRkUG9pbnRlcnMiLCJhZGRSZWxhdGlvbnMiLCJ0cmFuc2Zvcm1Ub0dyYXBoUUwiLCJPYmplY3QiLCJrZXlzIiwibWFwIl0sInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0dyYXBoUUwvdHJhbnNmb3JtZXJzL3NjaGVtYUZpZWxkcy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5cbmNvbnN0IHRyYW5zZm9ybVRvUGFyc2UgPSAoZ3JhcGhRTFNjaGVtYUZpZWxkcywgZXhpc3RpbmdGaWVsZHMpID0+IHtcbiAgaWYgKCFncmFwaFFMU2NoZW1hRmllbGRzKSB7XG4gICAgcmV0dXJuIHt9O1xuICB9XG5cbiAgbGV0IHBhcnNlU2NoZW1hRmllbGRzID0ge307XG5cbiAgY29uc3QgcmVkdWNlckdlbmVyYXRvciA9IHR5cGUgPT4gKHBhcnNlU2NoZW1hRmllbGRzLCBmaWVsZCkgPT4ge1xuICAgIGlmICh0eXBlID09PSAnUmVtb3ZlJykge1xuICAgICAgaWYgKGV4aXN0aW5nRmllbGRzW2ZpZWxkLm5hbWVdKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgLi4ucGFyc2VTY2hlbWFGaWVsZHMsXG4gICAgICAgICAgW2ZpZWxkLm5hbWVdOiB7XG4gICAgICAgICAgICBfX29wOiAnRGVsZXRlJyxcbiAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHBhcnNlU2NoZW1hRmllbGRzO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoXG4gICAgICBncmFwaFFMU2NoZW1hRmllbGRzLnJlbW92ZSAmJlxuICAgICAgZ3JhcGhRTFNjaGVtYUZpZWxkcy5yZW1vdmUuZmluZChyZW1vdmVGaWVsZCA9PiByZW1vdmVGaWVsZC5uYW1lID09PSBmaWVsZC5uYW1lKVxuICAgICkge1xuICAgICAgcmV0dXJuIHBhcnNlU2NoZW1hRmllbGRzO1xuICAgIH1cbiAgICBpZiAocGFyc2VTY2hlbWFGaWVsZHNbZmllbGQubmFtZV0gfHwgKGV4aXN0aW5nRmllbGRzICYmIGV4aXN0aW5nRmllbGRzW2ZpZWxkLm5hbWVdKSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsIGBEdXBsaWNhdGVkIGZpZWxkIG5hbWU6ICR7ZmllbGQubmFtZX1gKTtcbiAgICB9XG4gICAgaWYgKHR5cGUgPT09ICdSZWxhdGlvbicgfHwgdHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICAuLi5wYXJzZVNjaGVtYUZpZWxkcyxcbiAgICAgICAgW2ZpZWxkLm5hbWVdOiB7XG4gICAgICAgICAgdHlwZSxcbiAgICAgICAgICB0YXJnZXRDbGFzczogZmllbGQudGFyZ2V0Q2xhc3NOYW1lLFxuICAgICAgICB9LFxuICAgICAgfTtcbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgIC4uLnBhcnNlU2NoZW1hRmllbGRzLFxuICAgICAgW2ZpZWxkLm5hbWVdOiB7XG4gICAgICAgIHR5cGUsXG4gICAgICB9LFxuICAgIH07XG4gIH07XG5cbiAgaWYgKGdyYXBoUUxTY2hlbWFGaWVsZHMuYWRkU3RyaW5ncykge1xuICAgIHBhcnNlU2NoZW1hRmllbGRzID0gZ3JhcGhRTFNjaGVtYUZpZWxkcy5hZGRTdHJpbmdzLnJlZHVjZShcbiAgICAgIHJlZHVjZXJHZW5lcmF0b3IoJ1N0cmluZycpLFxuICAgICAgcGFyc2VTY2hlbWFGaWVsZHNcbiAgICApO1xuICB9XG4gIGlmIChncmFwaFFMU2NoZW1hRmllbGRzLmFkZE51bWJlcnMpIHtcbiAgICBwYXJzZVNjaGVtYUZpZWxkcyA9IGdyYXBoUUxTY2hlbWFGaWVsZHMuYWRkTnVtYmVycy5yZWR1Y2UoXG4gICAgICByZWR1Y2VyR2VuZXJhdG9yKCdOdW1iZXInKSxcbiAgICAgIHBhcnNlU2NoZW1hRmllbGRzXG4gICAgKTtcbiAgfVxuICBpZiAoZ3JhcGhRTFNjaGVtYUZpZWxkcy5hZGRCb29sZWFucykge1xuICAgIHBhcnNlU2NoZW1hRmllbGRzID0gZ3JhcGhRTFNjaGVtYUZpZWxkcy5hZGRCb29sZWFucy5yZWR1Y2UoXG4gICAgICByZWR1Y2VyR2VuZXJhdG9yKCdCb29sZWFuJyksXG4gICAgICBwYXJzZVNjaGVtYUZpZWxkc1xuICAgICk7XG4gIH1cbiAgaWYgKGdyYXBoUUxTY2hlbWFGaWVsZHMuYWRkQXJyYXlzKSB7XG4gICAgcGFyc2VTY2hlbWFGaWVsZHMgPSBncmFwaFFMU2NoZW1hRmllbGRzLmFkZEFycmF5cy5yZWR1Y2UoXG4gICAgICByZWR1Y2VyR2VuZXJhdG9yKCdBcnJheScpLFxuICAgICAgcGFyc2VTY2hlbWFGaWVsZHNcbiAgICApO1xuICB9XG4gIGlmIChncmFwaFFMU2NoZW1hRmllbGRzLmFkZE9iamVjdHMpIHtcbiAgICBwYXJzZVNjaGVtYUZpZWxkcyA9IGdyYXBoUUxTY2hlbWFGaWVsZHMuYWRkT2JqZWN0cy5yZWR1Y2UoXG4gICAgICByZWR1Y2VyR2VuZXJhdG9yKCdPYmplY3QnKSxcbiAgICAgIHBhcnNlU2NoZW1hRmllbGRzXG4gICAgKTtcbiAgfVxuICBpZiAoZ3JhcGhRTFNjaGVtYUZpZWxkcy5hZGREYXRlcykge1xuICAgIHBhcnNlU2NoZW1hRmllbGRzID0gZ3JhcGhRTFNjaGVtYUZpZWxkcy5hZGREYXRlcy5yZWR1Y2UoXG4gICAgICByZWR1Y2VyR2VuZXJhdG9yKCdEYXRlJyksXG4gICAgICBwYXJzZVNjaGVtYUZpZWxkc1xuICAgICk7XG4gIH1cbiAgaWYgKGdyYXBoUUxTY2hlbWFGaWVsZHMuYWRkRmlsZXMpIHtcbiAgICBwYXJzZVNjaGVtYUZpZWxkcyA9IGdyYXBoUUxTY2hlbWFGaWVsZHMuYWRkRmlsZXMucmVkdWNlKFxuICAgICAgcmVkdWNlckdlbmVyYXRvcignRmlsZScpLFxuICAgICAgcGFyc2VTY2hlbWFGaWVsZHNcbiAgICApO1xuICB9XG4gIGlmIChncmFwaFFMU2NoZW1hRmllbGRzLmFkZEdlb1BvaW50KSB7XG4gICAgcGFyc2VTY2hlbWFGaWVsZHMgPSBbZ3JhcGhRTFNjaGVtYUZpZWxkcy5hZGRHZW9Qb2ludF0ucmVkdWNlKFxuICAgICAgcmVkdWNlckdlbmVyYXRvcignR2VvUG9pbnQnKSxcbiAgICAgIHBhcnNlU2NoZW1hRmllbGRzXG4gICAgKTtcbiAgfVxuICBpZiAoZ3JhcGhRTFNjaGVtYUZpZWxkcy5hZGRQb2x5Z29ucykge1xuICAgIHBhcnNlU2NoZW1hRmllbGRzID0gZ3JhcGhRTFNjaGVtYUZpZWxkcy5hZGRQb2x5Z29ucy5yZWR1Y2UoXG4gICAgICByZWR1Y2VyR2VuZXJhdG9yKCdQb2x5Z29uJyksXG4gICAgICBwYXJzZVNjaGVtYUZpZWxkc1xuICAgICk7XG4gIH1cbiAgaWYgKGdyYXBoUUxTY2hlbWFGaWVsZHMuYWRkQnl0ZXMpIHtcbiAgICBwYXJzZVNjaGVtYUZpZWxkcyA9IGdyYXBoUUxTY2hlbWFGaWVsZHMuYWRkQnl0ZXMucmVkdWNlKFxuICAgICAgcmVkdWNlckdlbmVyYXRvcignQnl0ZXMnKSxcbiAgICAgIHBhcnNlU2NoZW1hRmllbGRzXG4gICAgKTtcbiAgfVxuICBpZiAoZ3JhcGhRTFNjaGVtYUZpZWxkcy5hZGRQb2ludGVycykge1xuICAgIHBhcnNlU2NoZW1hRmllbGRzID0gZ3JhcGhRTFNjaGVtYUZpZWxkcy5hZGRQb2ludGVycy5yZWR1Y2UoXG4gICAgICByZWR1Y2VyR2VuZXJhdG9yKCdQb2ludGVyJyksXG4gICAgICBwYXJzZVNjaGVtYUZpZWxkc1xuICAgICk7XG4gIH1cbiAgaWYgKGdyYXBoUUxTY2hlbWFGaWVsZHMuYWRkUmVsYXRpb25zKSB7XG4gICAgcGFyc2VTY2hlbWFGaWVsZHMgPSBncmFwaFFMU2NoZW1hRmllbGRzLmFkZFJlbGF0aW9ucy5yZWR1Y2UoXG4gICAgICByZWR1Y2VyR2VuZXJhdG9yKCdSZWxhdGlvbicpLFxuICAgICAgcGFyc2VTY2hlbWFGaWVsZHNcbiAgICApO1xuICB9XG4gIGlmIChleGlzdGluZ0ZpZWxkcyAmJiBncmFwaFFMU2NoZW1hRmllbGRzLnJlbW92ZSkge1xuICAgIHBhcnNlU2NoZW1hRmllbGRzID0gZ3JhcGhRTFNjaGVtYUZpZWxkcy5yZW1vdmUucmVkdWNlKFxuICAgICAgcmVkdWNlckdlbmVyYXRvcignUmVtb3ZlJyksXG4gICAgICBwYXJzZVNjaGVtYUZpZWxkc1xuICAgICk7XG4gIH1cblxuICByZXR1cm4gcGFyc2VTY2hlbWFGaWVsZHM7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1Ub0dyYXBoUUwgPSBwYXJzZVNjaGVtYUZpZWxkcyA9PiB7XG4gIHJldHVybiBPYmplY3Qua2V5cyhwYXJzZVNjaGVtYUZpZWxkcykubWFwKG5hbWUgPT4gKHtcbiAgICBuYW1lLFxuICAgIHR5cGU6IHBhcnNlU2NoZW1hRmllbGRzW25hbWVdLnR5cGUsXG4gICAgdGFyZ2V0Q2xhc3NOYW1lOiBwYXJzZVNjaGVtYUZpZWxkc1tuYW1lXS50YXJnZXRDbGFzcyxcbiAgfSkpO1xufTtcblxuZXhwb3J0IHsgdHJhbnNmb3JtVG9QYXJzZSwgdHJhbnNmb3JtVG9HcmFwaFFMIH07XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBO0FBQStCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUUvQixNQUFNQSxnQkFBZ0IsR0FBRyxD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