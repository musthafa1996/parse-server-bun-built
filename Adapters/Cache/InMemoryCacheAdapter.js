"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.InMemoryCacheAdapter = void 0;
var _LRUCache = require("./LRUCache");
class InMemoryCacheAdapter {
  constructor(ctx) {
    this.cache = new _LRUCache.LRUCache(ctx);
  }
  get(key) {
    const record = this.cache.get(key);
    if (record === null) {
      return Promise.resolve(null);
    }
    return Promise.resolve(record);
  }
  put(key, value, ttl) {
    this.cache.put(key, value, ttl);
    return Promise.resolve();
  }
  del(key) {
    this.cache.del(key);
    return Promise.resolve();
  }
  clear() {
    this.cache.clear();
    return Promise.resolve();
  }
}
exports.InMemoryCacheAdapter = InMemoryCacheAdapter;
var _default = InMemoryCacheAdapter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJJbk1lbW9yeUNhY2hlQWRhcHRlciIsImNvbnN0cnVjdG9yIiwiY3R4IiwiY2FjaGUiLCJMUlVDYWNoZSIsImdldCIsImtleSIsInJlY29yZCIsIlByb21pc2UiLCJyZXNvbHZlIiwicHV0IiwidmFsdWUiLCJ0dGwiLCJkZWwiLCJjbGVhciJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9DYWNoZS9Jbk1lbW9yeUNhY2hlQWRhcHRlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBMUlVDYWNoZSB9IGZyb20gJy4vTFJVQ2FjaGUnO1xuXG5leHBvcnQgY2xhc3MgSW5NZW1vcnlDYWNoZUFkYXB0ZXIge1xuICBjb25zdHJ1Y3RvcihjdHgpIHtcbiAgICB0aGlzLmNhY2hlID0gbmV3IExSVUNhY2hlKGN0eCk7XG4gIH1cblxuICBnZXQoa2V5KSB7XG4gICAgY29uc3QgcmVjb3JkID0gdGhpcy5jYWNoZS5nZXQoa2V5KTtcbiAgICBpZiAocmVjb3JkID09PSBudWxsKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwpO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlY29yZCk7XG4gIH1cblxuICBwdXQoa2V5LCB2YWx1ZSwgdHRsKSB7XG4gICAgdGhpcy5jYWNoZS5wdXQoa2V5LCB2YWx1ZSwgdHRsKTtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICBkZWwoa2V5KSB7XG4gICAgdGhpcy5jYWNoZS5kZWwoa2V5KTtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICBjbGVhcigpIHtcbiAgICB0aGlzLmNhY2hlLmNsZWFyKCk7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IEluTWVtb3J5Q2FjaGVBZGFwdGVyO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQTtBQUVPLE1BQU1BLG9CQUFvQixDQUFDO0VBQ2hDQyxXQUFXLENBQUNDLEdBQUcsRUFBRTtJQUNmLElBQUksQ0FBQ0MsS0FBSyxHQUFHLElBQUlDLGtCQUFRLENBQUNGLEdBQUcsQ0FBQztFQUNoQztFQUVBRyxHQUFHLENBQUNDLEdBQUcsRUFBRTtJQUNQLE1BQU1DLE1BQU0sR0FBRyxJQUFJLENBQUNKLEtBQUssQ0FBQ0UsR0FBRyxDQUFDQyxHQUFHLENBQUM7SUFDbEMsSUFBSUMsTUFBTSxLQUFLLElBQUksRUFBRTtNQUNuQixPQUFPQyxPQUFPLENBQUNDLE9BQU8sQ0FBQyxJQUFJLENBQUM7SUFDOUI7SUFDQSxPQUFPRCxPQUFPLENBQUNDLE9BQU8sQ0FBQ0YsTUFBTSxDQUFDO0VBQ2hDO0VBRUFHLEdBQUcsQ0FBQ0osR0FBRyxFQUFFSyxLQUFLLEVBQUVDLEdBQUcsRUFBRTtJQUNuQixJQUFJLENBQUNULEtBQUssQ0FBQ08sR0FBRyxDQUFDSixHQUFHLEVBQUVLLEtBQUssRUFBRUMsR0FBRyxDQUFDO0lBQy9CLE9BQU9KLE9BQU8sQ0FBQ0MsT0FBTyxFQUFFO0VBQzFCO0VBRUFJLEdBQUcsQ0FBQ1AsR0FBRyxFQUFFO0lBQ1AsSUFBSSxDQUFDSCxLQUFLLENBQUNVLEdBQUcsQ0FBQ1AsR0FBRyxDQUFDO0lBQ25CLE9BQU9FLE9BQU8sQ0FBQ0MsT0FBTyxFQUFFO0VBQzFCO0VBRUFLLEtBQUssR0FBRztJQUNOLElBQUksQ0FBQ1gsS0FBSyxDQUFDVyxLQUFLLEVBQUU7SUFDbEIsT0FBT04sT0FBTyxDQUFDQyxPQUFPLEVBQUU7RUFDMUI7QUFDRjtBQUFDO0FBQUEsZUFFY1Qsb0JBQW9CO0FBQUEifQ==