"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.addRateLimit = exports.DEFAULT_ALLOWED_HEADERS = void 0;
exports.allowCrossDomain = allowCrossDomain;
exports.allowMethodOverride = allowMethodOverride;
exports.enforceMasterKeyAccess = enforceMasterKeyAccess;
exports.handleParseErrors = handleParseErrors;
exports.handleParseHeaders = handleParseHeaders;
exports.handleParseSession = void 0;
exports.promiseEnforceMasterKeyAccess = promiseEnforceMasterKeyAccess;
exports.promiseEnsureIdempotency = promiseEnsureIdempotency;
var _cache = _interopRequireDefault(require("./cache"));
var _node = _interopRequireDefault(require("parse/node"));
var _Auth = _interopRequireDefault(require("./Auth"));
var _Config = _interopRequireDefault(require("./Config"));
var _ClientSDK = _interopRequireDefault(require("./ClientSDK"));
var _logger = _interopRequireDefault(require("./logger"));
var _rest = _interopRequireDefault(require("./rest"));
var _MongoStorageAdapter = _interopRequireDefault(require("./Adapters/Storage/Mongo/MongoStorageAdapter"));
var _PostgresStorageAdapter = _interopRequireDefault(require("./Adapters/Storage/Postgres/PostgresStorageAdapter"));
var _expressRateLimit = _interopRequireDefault(require("express-rate-limit"));
var _Definitions = require("./Options/Definitions");
var _pathToRegexp = _interopRequireDefault(require("path-to-regexp"));
var _ipRangeCheck = _interopRequireDefault(require("ip-range-check"));
var _rateLimitRedis = _interopRequireDefault(require("rate-limit-redis"));
var _redis = require("redis");
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
const DEFAULT_ALLOWED_HEADERS = 'X-Parse-Master-Key, X-Parse-REST-API-Key, X-Parse-Javascript-Key, X-Parse-Application-Id, X-Parse-Client-Version, X-Parse-Session-Token, X-Requested-With, X-Parse-Revocable-Session, X-Parse-Request-Id, Content-Type, Pragma, Cache-Control';
exports.DEFAULT_ALLOWED_HEADERS = DEFAULT_ALLOWED_HEADERS;
const getMountForRequest = function (req) {
  const mountPathLength = req.originalUrl.length - req.url.length;
  const mountPath = req.originalUrl.slice(0, mountPathLength);
  return req.protocol + '://' + req.get('host') + mountPath;
};

// Checks that the request is authorized for this app and checks user
// auth too.
// The bodyparser should run before this middleware.
// Adds info to the request:
// req.config - the Config for this app
// req.auth - the Auth for this request
function handleParseHeaders(req, res, next) {
  var mount = getMountForRequest(req);
  let context = {};
  if (req.get('X-Parse-Cloud-Context') != null) {
    try {
      context = JSON.parse(req.get('X-Parse-Cloud-Context'));
      if (Object.prototype.toString.call(context) !== '[object Object]') {
        throw 'Context is not an object';
      }
    } catch (e) {
      return malformedContext(req, res);
    }
  }
  var info = {
    appId: req.get('X-Parse-Application-Id'),
    sessionToken: req.get('X-Parse-Session-Token'),
    masterKey: req.get('X-Parse-Master-Key'),
    maintenanceKey: req.get('X-Parse-Maintenance-Key'),
    installationId: req.get('X-Parse-Installation-Id'),
    clientKey: req.get('X-Parse-Client-Key'),
    javascriptKey: req.get('X-Parse-Javascript-Key'),
    dotNetKey: req.get('X-Parse-Windows-Key'),
    restAPIKey: req.get('X-Parse-REST-API-Key'),
    clientVersion: req.get('X-Parse-Client-Version'),
    context: context
  };
  var basicAuth = httpAuth(req);
  if (basicAuth) {
    var basicAuthAppId = basicAuth.appId;
    if (_cache.default.get(basicAuthAppId)) {
      info.appId = basicAuthAppId;
      info.masterKey = basicAuth.masterKey || info.masterKey;
      info.javascriptKey = basicAuth.javascriptKey || info.javascriptKey;
    }
  }
  if (req.body) {
    // Unity SDK sends a _noBody key which needs to be removed.
    // Unclear at this point if action needs to be taken.
    delete req.body._noBody;
  }
  var fileViaJSON = false;
  if (!info.appId || !_cache.default.get(info.appId)) {
    // See if we can find the app id on the body.
    if (req.body instanceof Buffer) {
      // The only chance to find the app id is if this is a file
      // upload that actually is a JSON body. So try to parse it.
      // https://github.com/parse-community/parse-server/issues/6589
      // It is also possible that the client is trying to upload a file but forgot
      // to provide x-parse-app-id in header and parse a binary file will fail
      try {
        req.body = JSON.parse(req.body);
      } catch (e) {
        return invalidRequest(req, res);
      }
      fileViaJSON = true;
    }
    if (req.body) {
      delete req.body._RevocableSession;
    }
    if (req.body && req.body._ApplicationId && _cache.default.get(req.body._ApplicationId) && (!info.masterKey || _cache.default.get(req.body._ApplicationId).masterKey === info.masterKey)) {
      info.appId = req.body._ApplicationId;
      info.javascriptKey = req.body._JavaScriptKey || '';
      delete req.body._ApplicationId;
      delete req.body._JavaScriptKey;
      // TODO: test that the REST API formats generated by the other
      // SDKs are handled ok
      if (req.body._ClientVersion) {
        info.clientVersion = req.body._ClientVersion;
        delete req.body._ClientVersion;
      }
      if (req.body._InstallationId) {
        info.installationId = req.body._InstallationId;
        delete req.body._InstallationId;
      }
      if (req.body._SessionToken) {
        info.sessionToken = req.body._SessionToken;
        delete req.body._SessionToken;
      }
      if (req.body._MasterKey) {
        info.masterKey = req.body._MasterKey;
        delete req.body._MasterKey;
      }
      if (req.body._context) {
        if (req.body._context instanceof Object) {
          info.context = req.body._context;
        } else {
          try {
            info.context = JSON.parse(req.body._context);
            if (Object.prototype.toString.call(info.context) !== '[object Object]') {
              throw 'Context is not an object';
            }
          } catch (e) {
            return malformedContext(req, res);
          }
        }
        delete req.body._context;
      }
      if (req.body._ContentType) {
        req.headers['content-type'] = req.body._ContentType;
        delete req.body._ContentType;
      }
    } else {
      return invalidRequest(req, res);
    }
  }
  if (info.sessionToken && typeof info.sessionToken !== 'string') {
    info.sessionToken = info.sessionToken.toString();
  }
  if (info.clientVersion) {
    info.clientSDK = _ClientSDK.default.fromString(info.clientVersion);
  }
  if (fileViaJSON) {
    req.fileData = req.body.fileData;
    // We need to repopulate req.body with a buffer
    var base64 = req.body.base64;
    req.body = Buffer.from(base64, 'base64');
  }
  const clientIp = getClientIp(req);
  const config = _Config.default.get(info.appId, mount);
  if (config.state && config.state !== 'ok') {
    res.status(500);
    res.json({
      code: _node.default.Error.INTERNAL_SERVER_ERROR,
      error: `Invalid server state: ${config.state}`
    });
    return;
  }
  info.app = _cache.default.get(info.appId);
  req.config = config;
  req.config.headers = req.headers || {};
  req.config.ip = clientIp;
  req.info = info;
  const isMaintenance = req.config.maintenanceKey && info.maintenanceKey === req.config.maintenanceKey;
  if (isMaintenance) {
    var _req$config;
    if ((0, _ipRangeCheck.default)(clientIp, req.config.maintenanceKeyIps || [])) {
      req.auth = new _Auth.default.Auth({
        config: req.config,
        installationId: info.installationId,
        isMaintenance: true
      });
      next();
      return;
    }
    const log = ((_req$config = req.config) === null || _req$config === void 0 ? void 0 : _req$config.loggerController) || _logger.default;
    log.error(`Request using maintenance key rejected as the request IP address '${clientIp}' is not set in Parse Server option 'maintenanceKeyIps'.`);
  }
  let isMaster = info.masterKey === req.config.masterKey;
  if (isMaster && !(0, _ipRangeCheck.default)(clientIp, req.config.masterKeyIps || [])) {
    var _req$config2;
    const log = ((_req$config2 = req.config) === null || _req$config2 === void 0 ? void 0 : _req$config2.loggerController) || _logger.default;
    log.error(`Request using master key rejected as the request IP address '${clientIp}' is not set in Parse Server option 'masterKeyIps'.`);
    isMaster = false;
  }
  if (isMaster) {
    req.auth = new _Auth.default.Auth({
      config: req.config,
      installationId: info.installationId,
      isMaster: true
    });
    return handleRateLimit(req, res, next);
  }
  var isReadOnlyMaster = info.masterKey === req.config.readOnlyMasterKey;
  if (typeof req.config.readOnlyMasterKey != 'undefined' && req.config.readOnlyMasterKey && isReadOnlyMaster) {
    req.auth = new _Auth.default.Auth({
      config: req.config,
      installationId: info.installationId,
      isMaster: true,
      isReadOnly: true
    });
    return handleRateLimit(req, res, next);
  }

  // Client keys are not required in parse-server, but if any have been configured in the server, validate them
  //  to preserve original behavior.
  const keys = ['clientKey', 'javascriptKey', 'dotNetKey', 'restAPIKey'];
  const oneKeyConfigured = keys.some(function (key) {
    return req.config[key] !== undefined;
  });
  const oneKeyMatches = keys.some(function (key) {
    return req.config[key] !== undefined && info[key] === req.config[key];
  });
  if (oneKeyConfigured && !oneKeyMatches) {
    return invalidRequest(req, res);
  }
  if (req.url == '/login') {
    delete info.sessionToken;
  }
  if (req.userFromJWT) {
    req.auth = new _Auth.default.Auth({
      config: req.config,
      installationId: info.installationId,
      isMaster: false,
      user: req.userFromJWT
    });
    return handleRateLimit(req, res, next);
  }
  if (!info.sessionToken) {
    req.auth = new _Auth.default.Auth({
      config: req.config,
      installationId: info.installationId,
      isMaster: false
    });
  }
  handleRateLimit(req, res, next);
}
const handleRateLimit = async (req, res, next) => {
  const rateLimits = req.config.rateLimits || [];
  try {
    await Promise.all(rateLimits.map(async limit => {
      const pathExp = new RegExp(limit.path);
      if (pathExp.test(req.url)) {
        await limit.handler(req, res, err => {
          if (err) {
            if (err.code === _node.default.Error.CONNECTION_FAILED) {
              throw err;
            }
            req.config.loggerController.error('An unknown error occured when attempting to apply the rate limiter: ', err);
          }
        });
      }
    }));
  } catch (error) {
    res.status(429);
    res.json({
      code: _node.default.Error.CONNECTION_FAILED,
      error: error.message
    });
    return;
  }
  next();
};
const handleParseSession = async (req, res, next) => {
  try {
    const info = req.info;
    if (req.auth) {
      next();
      return;
    }
    let requestAuth = null;
    if (info.sessionToken && req.url === '/upgradeToRevocableSession' && info.sessionToken.indexOf('r:') != 0) {
      requestAuth = await _Auth.default.getAuthForLegacySessionToken({
        config: req.config,
        installationId: info.installationId,
        sessionToken: info.sessionToken
      });
    } else {
      requestAuth = await _Auth.default.getAuthForSessionToken({
        config: req.config,
        installationId: info.installationId,
        sessionToken: info.sessionToken
      });
    }
    req.auth = requestAuth;
    next();
  } catch (error) {
    if (error instanceof _node.default.Error) {
      next(error);
      return;
    }
    // TODO: Determine the correct error scenario.
    req.config.loggerController.error('error getting auth for sessionToken', error);
    throw new _node.default.Error(_node.default.Error.UNKNOWN_ERROR, error);
  }
};
exports.handleParseSession = handleParseSession;
function getClientIp(req) {
  return req.ip;
}
function httpAuth(req) {
  if (!(req.req || req).headers.authorization) return;
  var header = (req.req || req).headers.authorization;
  var appId, masterKey, javascriptKey;

  // parse header
  var authPrefix = 'basic ';
  var match = header.toLowerCase().indexOf(authPrefix);
  if (match == 0) {
    var encodedAuth = header.substring(authPrefix.length, header.length);
    var credentials = decodeBase64(encodedAuth).split(':');
    if (credentials.length == 2) {
      appId = credentials[0];
      var key = credentials[1];
      var jsKeyPrefix = 'javascript-key=';
      var matchKey = key.indexOf(jsKeyPrefix);
      if (matchKey == 0) {
        javascriptKey = key.substring(jsKeyPrefix.length, key.length);
      } else {
        masterKey = key;
      }
    }
  }
  return {
    appId: appId,
    masterKey: masterKey,
    javascriptKey: javascriptKey
  };
}
function decodeBase64(str) {
  return Buffer.from(str, 'base64').toString();
}
function allowCrossDomain(appId) {
  return (req, res, next) => {
    const config = _Config.default.get(appId, getMountForRequest(req));
    let allowHeaders = DEFAULT_ALLOWED_HEADERS;
    if (config && config.allowHeaders) {
      allowHeaders += `, ${config.allowHeaders.join(', ')}`;
    }
    const baseOrigins = typeof (config === null || config === void 0 ? void 0 : config.allowOrigin) === 'string' ? [config.allowOrigin] : (config === null || config === void 0 ? void 0 : config.allowOrigin) ?? ['*'];
    const requestOrigin = req.headers.origin;
    const allowOrigins = requestOrigin && baseOrigins.includes(requestOrigin) ? requestOrigin : baseOrigins[0];
    res.header('Access-Control-Allow-Origin', allowOrigins);
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', allowHeaders);
    res.header('Access-Control-Expose-Headers', 'X-Parse-Job-Status-Id, X-Parse-Push-Status-Id');
    // intercept OPTIONS method
    if ('OPTIONS' == req.method) {
      res.sendStatus(200);
    } else {
      next();
    }
  };
}
function allowMethodOverride(req, res, next) {
  if (req.method === 'POST' && req.body._method) {
    req.originalMethod = req.method;
    req.method = req.body._method;
    delete req.body._method;
  }
  next();
}
function handleParseErrors(err, req, res, next) {
  const log = req.config && req.config.loggerController || _logger.default;
  if (err instanceof _node.default.Error) {
    if (req.config && req.config.enableExpressErrorHandler) {
      return next(err);
    }
    let httpStatus;
    // TODO: fill out this mapping
    switch (err.code) {
      case _node.default.Error.INTERNAL_SERVER_ERROR:
        httpStatus = 500;
        break;
      case _node.default.Error.OBJECT_NOT_FOUND:
        httpStatus = 404;
        break;
      default:
        httpStatus = 400;
    }
    res.status(httpStatus);
    res.json({
      code: err.code,
      error: err.message
    });
    log.error('Parse error: ', err);
  } else if (err.status && err.message) {
    res.status(err.status);
    res.json({
      error: err.message
    });
    if (!(process && process.env.TESTING)) {
      next(err);
    }
  } else {
    log.error('Uncaught internal server error.', err, err.stack);
    res.status(500);
    res.json({
      code: _node.default.Error.INTERNAL_SERVER_ERROR,
      message: 'Internal server error.'
    });
    if (!(process && process.env.TESTING)) {
      next(err);
    }
  }
}
function enforceMasterKeyAccess(req, res, next) {
  if (!req.auth.isMaster) {
    res.status(403);
    res.end('{"error":"unauthorized: master key is required"}');
    return;
  }
  next();
}
function promiseEnforceMasterKeyAccess(request) {
  if (!request.auth.isMaster) {
    const error = new Error();
    error.status = 403;
    error.message = 'unauthorized: master key is required';
    throw error;
  }
  return Promise.resolve();
}
const addRateLimit = (route, config, cloud) => {
  if (typeof config === 'string') {
    config = _Config.default.get(config);
  }
  for (const key in route) {
    if (!_Definitions.RateLimitOptions[key]) {
      throw `Invalid rate limit option "${key}"`;
    }
  }
  if (!config.rateLimits) {
    config.rateLimits = [];
  }
  const redisStore = {
    connectionPromise: Promise.resolve(),
    store: null,
    connected: false
  };
  if (route.redisUrl) {
    const client = (0, _redis.createClient)({
      url: route.redisUrl
    });
    redisStore.connectionPromise = async () => {
      if (redisStore.connected) {
        return;
      }
      try {
        await client.connect();
        redisStore.connected = true;
      } catch (e) {
        var _config;
        const log = ((_config = config) === null || _config === void 0 ? void 0 : _config.loggerController) || _logger.default;
        log.error(`Could not connect to redisURL in rate limit: ${e}`);
      }
    };
    redisStore.connectionPromise();
    redisStore.store = new _rateLimitRedis.default({
      sendCommand: async (...args) => {
        await redisStore.connectionPromise();
        return client.sendCommand(args);
      }
    });
  }
  config.rateLimits.push({
    path: (0, _pathToRegexp.default)(route.requestPath),
    handler: (0, _expressRateLimit.default)({
      windowMs: route.requestTimeWindow,
      max: route.requestCount,
      message: route.errorResponseMessage || _Definitions.RateLimitOptions.errorResponseMessage.default,
      handler: (request, response, next, options) => {
        throw {
          code: _node.default.Error.CONNECTION_FAILED,
          message: options.message
        };
      },
      skip: request => {
        var _request$auth;
        if (request.ip === '127.0.0.1' && !route.includeInternalRequests) {
          return true;
        }
        if (route.includeMasterKey) {
          return false;
        }
        if (route.requestMethods) {
          if (Array.isArray(route.requestMethods)) {
            if (!route.requestMethods.includes(request.method)) {
              return true;
            }
          } else {
            const regExp = new RegExp(route.requestMethods);
            if (!regExp.test(request.method)) {
              return true;
            }
          }
        }
        return (_request$auth = request.auth) === null || _request$auth === void 0 ? void 0 : _request$auth.isMaster;
      },
      keyGenerator: request => {
        return request.config.ip;
      },
      store: redisStore.store
    }),
    cloud
  });
  _Config.default.put(config);
};

/**
 * Deduplicates a request to ensure idempotency. Duplicates are determined by the request ID
 * in the request header. If a request has no request ID, it is executed anyway.
 * @param {*} req The request to evaluate.
 * @returns Promise<{}>
 */
exports.addRateLimit = addRateLimit;
function promiseEnsureIdempotency(req) {
  // Enable feature only for MongoDB
  if (!(req.config.database.adapter instanceof _MongoStorageAdapter.default || req.config.database.adapter instanceof _PostgresStorageAdapter.default)) {
    return Promise.resolve();
  }
  // Get parameters
  const config = req.config;
  const requestId = ((req || {}).headers || {})['x-parse-request-id'];
  const {
    paths,
    ttl
  } = config.idempotencyOptions;
  if (!requestId || !config.idempotencyOptions) {
    return Promise.resolve();
  }
  // Request path may contain trailing slashes, depending on the original request, so remove
  // leading and trailing slashes to make it easier to specify paths in the configuration
  const reqPath = req.path.replace(/^\/|\/$/, '');
  // Determine whether idempotency is enabled for current request path
  let match = false;
  for (const path of paths) {
    // Assume one wants a path to always match from the beginning to prevent any mistakes
    const regex = new RegExp(path.charAt(0) === '^' ? path : '^' + path);
    if (reqPath.match(regex)) {
      match = true;
      break;
    }
  }
  if (!match) {
    return Promise.resolve();
  }
  // Try to store request
  const expiryDate = new Date(new Date().setSeconds(new Date().getSeconds() + ttl));
  return _rest.default.create(config, _Auth.default.master(config), '_Idempotency', {
    reqId: requestId,
    expire: _node.default._encode(expiryDate)
  }).catch(e => {
    if (e.code == _node.default.Error.DUPLICATE_VALUE) {
      throw new _node.default.Error(_node.default.Error.DUPLICATE_REQUEST, 'Duplicate request');
    }
    throw e;
  });
}
function invalidRequest(req, res) {
  res.status(403);
  res.end('{"error":"unauthorized"}');
}
function malformedContext(req, res) {
  res.status(400);
  res.json({
    code: _node.default.Error.INVALID_JSON,
    error: 'Invalid object for context.'
  });
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJERUZBVUxUX0FMTE9XRURfSEVBREVSUyIsImdldE1vdW50Rm9yUmVxdWVzdCIsInJlcSIsIm1vdW50UGF0aExlbmd0aCIsIm9yaWdpbmFsVXJsIiwibGVuZ3RoIiwidXJsIiwibW91bnRQYXRoIiwic2xpY2UiLCJwcm90b2NvbCIsImdldCIsImhhbmRsZVBhcnNlSGVhZGVycyIsInJlcyIsIm5leHQiLCJtb3VudCIsImNvbnRleHQiLCJKU09OIiwicGFyc2UiLCJPYmplY3QiLCJwcm90b3R5cGUiLCJ0b1N0cmluZyIsImNhbGwiLCJlIiwibWFsZm9ybWVkQ29udGV4dCIsImluZm8iLCJhcHBJZCIsInNlc3Npb25Ub2tlbiIsIm1hc3RlcktleSIsIm1haW50ZW5hbmNlS2V5IiwiaW5zdGFsbGF0aW9uSWQiLCJjbGllbnRLZXkiLCJqYXZhc2NyaXB0S2V5IiwiZG90TmV0S2V5IiwicmVzdEFQSUtleSIsImNsaWVudFZlcnNpb24iLCJiYXNpY0F1dGgiLCJodHRwQXV0aCIsImJhc2ljQXV0aEFwcElkIiwiQXBwQ2FjaGUiLCJib2R5IiwiX25vQm9keSIsImZpbGVWaWFKU09OIiwiQnVmZmVyIiwiaW52YWxpZFJlcXVlc3QiLCJfUmV2b2NhYmxlU2Vzc2lvbiIsIl9BcHBsaWNhdGlvbklkIiwiX0phdmFTY3JpcHRLZXkiLCJfQ2xpZW50VmVyc2lvbiIsIl9JbnN0YWxsYXRpb25JZCIsIl9TZXNzaW9uVG9rZW4iLCJfTWFzdGVyS2V5IiwiX2NvbnRleHQiLCJfQ29udGVudFR5cGUiLCJoZWFkZXJzIiwiY2xpZW50U0RLIiwiQ2xpZW50U0RLIiwiZnJvbVN0cmluZyIsImZpbGVEYXRhIiwiYmFzZTY0IiwiZnJvbSIsImNsaWVudElwIiwiZ2V0Q2xpZW50SXAiLCJjb25maWciLCJDb25maWciLCJzdGF0ZSIsInN0YXR1cyIsImpzb24iLCJjb2RlIiwiUGFyc2UiLCJFcnJvciIsIklOVEVSTkFMX1NFUlZFUl9FUlJPUiIsImVycm9yIiwiYXBwIiwiaXAiLCJpc01haW50ZW5hbmNlIiwiaXBSYW5nZUNoZWNrIiwibWFpbnRlbmFuY2VLZXlJcHMiLCJhdXRoIiwiQXV0aCIsImxvZyIsImxvZ2dlckNvbnRyb2xsZXIiLCJkZWZhdWx0TG9nZ2VyIiwiaXNNYXN0ZXIiLCJtYXN0ZXJLZXlJcHMiLCJoYW5kbGVSYXRlTGltaXQiLCJpc1JlYWRPbmx5TWFzdGVyIiwicmVhZE9ubHlNYXN0ZXJLZXkiLCJpc1JlYWRPbmx5Iiwia2V5cyIsIm9uZUtleUNvbmZpZ3VyZWQiLCJzb21lIiwia2V5IiwidW5kZWZpbmVkIiwib25lS2V5TWF0Y2hlcyIsInVzZXJGcm9tSldUIiwidXNlciIsInJhdGVMaW1pdHMiLCJQcm9taXNlIiwiYWxsIiwibWFwIiwibGltaXQiLCJwYXRoRXhwIiwiUmVnRXhwIiwicGF0aCIsInRlc3QiLCJoYW5kbGVyIiwiZXJyIiwiQ09OTkVDVElPTl9GQUlMRUQiLCJtZXNzYWdlIiwiaGFuZGxlUGFyc2VTZXNzaW9uIiwicmVxdWVzdEF1dGgiLCJpbmRleE9mIiwiZ2V0QXV0aEZvckxlZ2FjeVNlc3Npb25Ub2tlbiIsImdldEF1dGhGb3JTZXNzaW9uVG9rZW4iLCJVTktOT1dOX0VSUk9SIiwiYXV0aG9yaXphdGlvbiIsImhlYWRlciIsImF1dGhQcmVmaXgiLCJtYXRjaCIsInRvTG93ZXJDYXNlIiwiZW5jb2RlZEF1dGgiLCJzdWJzdHJpbmciLCJjcmVkZW50aWFscyIsImRlY29kZUJhc2U2NCIsInNwbGl0IiwianNLZXlQcmVmaXgiLCJtYXRjaEtleSIsInN0ciIsImFsbG93Q3Jvc3NEb21haW4iLCJhbGxvd0hlYWRlcnMiLCJqb2luIiwiYmFzZU9yaWdpbnMiLCJhbGxvd09yaWdpbiIsInJlcXVlc3RPcmlnaW4iLCJvcmlnaW4iLCJhbGxvd09yaWdpbnMiLCJpbmNsdWRlcyIsIm1ldGhvZCIsInNlbmRTdGF0dXMiLCJhbGxvd01ldGhvZE92ZXJyaWRlIiwiX21ldGhvZCIsIm9yaWdpbmFsTWV0aG9kIiwiaGFuZGxlUGFyc2VFcnJvcnMiLCJlbmFibGVFeHByZXNzRXJyb3JIYW5kbGVyIiwiaHR0cFN0YXR1cyIsIk9CSkVDVF9OT1RfRk9VTkQiLCJwcm9jZXNzIiwiZW52IiwiVEVTVElORyIsInN0YWNrIiwiZW5mb3JjZU1hc3RlcktleUFjY2VzcyIsImVuZCIsInByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzIiwicmVxdWVzdCIsInJlc29sdmUiLCJhZGRSYXRlTGltaXQiLCJyb3V0ZSIsImNsb3VkIiwiUmF0ZUxpbWl0T3B0aW9ucyIsInJlZGlzU3RvcmUiLCJjb25uZWN0aW9uUHJvbWlzZSIsInN0b3JlIiwiY29ubmVjdGVkIiwicmVkaXNVcmwiLCJjbGllbnQiLCJjcmVhdGVDbGllbnQiLCJjb25uZWN0IiwiUmVkaXNTdG9yZSIsInNlbmRDb21tYW5kIiwiYXJncyIsInB1c2giLCJwYXRoVG9SZWdleHAiLCJyZXF1ZXN0UGF0aCIsInJhdGVMaW1pdCIsIndpbmRvd01zIiwicmVxdWVzdFRpbWVXaW5kb3ciLCJtYXgiLCJyZXF1ZXN0Q291bnQiLCJlcnJvclJlc3BvbnNlTWVzc2FnZSIsImRlZmF1bHQiLCJyZXNwb25zZSIsIm9wdGlvbnMiLCJza2lwIiwiaW5jbHVkZUludGVybmFsUmVxdWVzdHMiLCJpbmNsdWRlTWFzdGVyS2V5IiwicmVxdWVzdE1ldGhvZHMiLCJBcnJheSIsImlzQXJyYXkiLCJyZWdFeHAiLCJrZXlHZW5lcmF0b3IiLCJwdXQiLCJwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3kiLCJkYXRhYmFzZSIsImFkYXB0ZXIiLCJNb25nb1N0b3JhZ2VBZGFwdGVyIiwiUG9zdGdyZXNTdG9yYWdlQWRhcHRlciIsInJlcXVlc3RJZCIsInBhdGhzIiwidHRsIiwiaWRlbXBvdGVuY3lPcHRpb25zIiwicmVxUGF0aCIsInJlcGxhY2UiLCJyZWdleCIsImNoYXJBdCIsImV4cGlyeURhdGUiLCJEYXRlIiwic2V0U2Vjb25kcyIsImdldFNlY29uZHMiLCJyZXN0IiwiY3JlYXRlIiwibWFzdGVyIiwicmVxSWQiLCJleHBpcmUiLCJfZW5jb2RlIiwiY2F0Y2giLCJEVVBMSUNBVEVfVkFMVUUiLCJEVVBMSUNBVEVfUkVRVUVTVCIsIklOVkFMSURfSlNPTiJdLCJzb3VyY2VzIjpbIi4uL3NyYy9taWRkbGV3YXJlcy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgQXBwQ2FjaGUgZnJvbSAnLi9jYWNoZSc7XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgYXV0aCBmcm9tICcuL0F1dGgnO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuL0NvbmZpZyc7XG5pbXBvcnQgQ2xpZW50U0RLIGZyb20gJy4vQ2xpZW50U0RLJztcbmltcG9ydCBkZWZhdWx0TG9nZ2VyIGZyb20gJy4vbG9nZ2VyJztcbmltcG9ydCByZXN0IGZyb20gJy4vcmVzdCc7XG5pbXBvcnQgTW9uZ29TdG9yYWdlQWRhcHRlciBmcm9tICcuL0FkYXB0ZXJzL1N0b3JhZ2UvTW9uZ28vTW9uZ29TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgUG9zdGdyZXNTdG9yYWdlQWRhcHRlciBmcm9tICcuL0FkYXB0ZXJzL1N0b3JhZ2UvUG9zdGdyZXMvUG9zdGdyZXNTdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgcmF0ZUxpbWl0IGZyb20gJ2V4cHJlc3MtcmF0ZS1saW1pdCc7XG5pbXBvcnQgeyBSYXRlTGltaXRPcHRpb25zIH0gZnJvbSAnLi9PcHRpb25zL0RlZmluaXRpb25zJztcbmltcG9ydCBwYXRoVG9SZWdleHAgZnJvbSAncGF0aC10by1yZWdleHAnO1xuaW1wb3J0IGlwUmFuZ2VDaGVjayBmcm9tICdpcC1yYW5nZS1jaGVjayc7XG5pbXBvcnQgUmVkaXNTdG9yZSBmcm9tICdyYXRlLWxpbWl0LXJlZGlzJztcbmltcG9ydCB7IGNyZWF0ZUNsaWVudCB9IGZyb20gJ3JlZGlzJztcblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfQUxMT1dFRF9IRUFERVJTID1cbiAgJ1gtUGFyc2UtTWFzdGVyLUtleSwgWC1QYXJzZS1SRVNULUFQSS1LZXksIFgtUGFyc2UtSmF2YXNjcmlwdC1LZXksIFgtUGFyc2UtQXBwbGljYXRpb24tSWQsIFgtUGFyc2UtQ2xpZW50LVZlcnNpb24sIFgtUGFyc2UtU2Vzc2lvbi1Ub2tlbiwgWC1SZXF1ZXN0ZWQtV2l0aCwgWC1QYXJzZS1SZXZvY2FibGUtU2Vzc2lvbiwgWC1QYXJzZS1SZXF1ZXN0LUlkLCBDb250ZW50LVR5cGUsIFByYWdtYSwgQ2FjaGUtQ29udHJvbCc7XG5cbmNvbnN0IGdldE1vdW50Rm9yUmVxdWVzdCA9IGZ1bmN0aW9uIChyZXEpIHtcbiAgY29uc3QgbW91bnRQYXRoTGVuZ3RoID0gcmVxLm9yaWdpbmFsVXJsLmxlbmd0aCAtIHJlcS51cmwubGVuZ3RoO1xuICBjb25zdCBtb3VudFBhdGggPSByZXEub3JpZ2luYWxVcmwuc2xpY2UoMCwgbW91bnRQYXRoTGVuZ3RoKTtcbiAgcmV0dXJuIHJlcS5wcm90b2NvbCArICc6Ly8nICsgcmVxLmdldCgnaG9zdCcpICsgbW91bnRQYXRoO1xufTtcblxuLy8gQ2hlY2tzIHRoYXQgdGhlIHJlcXVlc3QgaXMgYXV0aG9yaXplZCBmb3IgdGhpcyBhcHAgYW5kIGNoZWNrcyB1c2VyXG4vLyBhdXRoIHRvby5cbi8vIFRoZSBib2R5cGFyc2VyIHNob3VsZCBydW4gYmVmb3JlIHRoaXMgbWlkZGxld2FyZS5cbi8vIEFkZHMgaW5mbyB0byB0aGUgcmVxdWVzdDpcbi8vIHJlcS5jb25maWcgLSB0aGUgQ29uZmlnIGZvciB0aGlzIGFwcFxuLy8gcmVxLmF1dGggLSB0aGUgQXV0aCBmb3IgdGhpcyByZXF1ZXN0XG5leHBvcnQgZnVuY3Rpb24gaGFuZGxlUGFyc2VIZWFkZXJzKHJlcSwgcmVzLCBuZXh0KSB7XG4gIHZhciBtb3VudCA9IGdldE1vdW50Rm9yUmVxdWVzdChyZXEpO1xuXG4gIGxldCBjb250ZXh0ID0ge307XG4gIGlmIChyZXEuZ2V0KCdYLVBhcnNlLUNsb3VkLUNvbnRleHQnKSAhPSBudWxsKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnRleHQgPSBKU09OLnBhcnNlKHJlcS5nZXQoJ1gtUGFyc2UtQ2xvdWQtQ29udGV4dCcpKTtcbiAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoY29udGV4dCkgIT09ICdbb2JqZWN0IE9iamVjdF0nKSB7XG4gICAgICAgIHRocm93ICdDb250ZXh0IGlzIG5vdCBhbiBvYmplY3QnO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHJldHVybiBtYWxmb3JtZWRDb250ZXh0KHJlcSwgcmVzKTtcbiAgICB9XG4gIH1cbiAgdmFyIGluZm8gPSB7XG4gICAgYXBwSWQ6IHJlcS5nZXQoJ1gtUGFyc2UtQXBwbGljYXRpb24tSWQnKSxcbiAgICBzZXNzaW9uVG9rZW46IHJlcS5nZXQoJ1gtUGFyc2UtU2Vzc2lvbi1Ub2tlbicpLFxuICAgIG1hc3RlcktleTogcmVxLmdldCgnWC1QYXJzZS1NYXN0ZXItS2V5JyksXG4gICAgbWFpbnRlbmFuY2VLZXk6IHJlcS5nZXQoJ1gtUGFyc2UtTWFpbnRlbmFuY2UtS2V5JyksXG4gICAgaW5zdGFsbGF0aW9uSWQ6IHJlcS5nZXQoJ1gtUGFyc2UtSW5zdGFsbGF0aW9uLUlkJyksXG4gICAgY2xpZW50S2V5OiByZXEuZ2V0KCdYLVBhcnNlLUNsaWVudC1LZXknKSxcbiAgICBqYXZhc2NyaXB0S2V5OiByZXEuZ2V0KCdYLVBhcnNlLUphdmFzY3JpcHQtS2V5JyksXG4gICAgZG90TmV0S2V5OiByZXEuZ2V0KCdYLVBhcnNlLVdpbmRvd3MtS2V5JyksXG4gICAgcmVzdEFQSUtleTogcmVxLmdldCgnWC1QYXJzZS1SRVNULUFQSS1LZXknKSxcbiAgICBjbGllbnRWZXJzaW9uOiByZXEuZ2V0KCdYLVBhcnNlLUNsaWVudC1WZXJzaW9uJyksXG4gICAgY29udGV4dDogY29udGV4dCxcbiAgfTtcblxuICB2YXIgYmFzaWNBdXRoID0gaHR0cEF1dGgocmVxKTtcblxuICBpZiAoYmFzaWNBdXRoKSB7XG4gICAgdmFyIGJhc2ljQXV0aEFwcElkID0gYmFzaWNBdXRoLmFwcElkO1xuICAgIGlmIChBcHBDYWNoZS5nZXQoYmFzaWNBdXRoQXBwSWQpKSB7XG4gICAgICBpbmZvLmFwcElkID0gYmFzaWNBdXRoQXBwSWQ7XG4gICAgICBpbmZvLm1hc3RlcktleSA9IGJhc2ljQXV0aC5tYXN0ZXJLZXkgfHwgaW5mby5tYXN0ZXJLZXk7XG4gICAgICBpbmZvLmphdmFzY3JpcHRLZXkgPSBiYXNpY0F1dGguamF2YXNjcmlwdEtleSB8fCBpbmZvLmphdmFzY3JpcHRLZXk7XG4gICAgfVxuICB9XG5cbiAgaWYgKHJlcS5ib2R5KSB7XG4gICAgLy8gVW5pdHkgU0RLIHNlbmRzIGEgX25vQm9keSBrZXkgd2hpY2ggbmVlZHMgdG8gYmUgcmVtb3ZlZC5cbiAgICAvLyBVbmNsZWFyIGF0IHRoaXMgcG9pbnQgaWYgYWN0aW9uIG5lZWRzIHRvIGJlIHRha2VuLlxuICAgIGRlbGV0ZSByZXEuYm9keS5fbm9Cb2R5O1xuICB9XG5cbiAgdmFyIGZpbGVWaWFKU09OID0gZmFsc2U7XG5cbiAgaWYgKCFpbmZvLmFwcElkIHx8ICFBcHBDYWNoZS5nZXQoaW5mby5hcHBJZCkpIHtcbiAgICAvLyBTZWUgaWYgd2UgY2FuIGZpbmQgdGhlIGFwcCBpZCBvbiB0aGUgYm9keS5cbiAgICBpZiAocmVxLmJvZHkgaW5zdGFuY2VvZiBCdWZmZXIpIHtcbiAgICAgIC8vIFRoZSBvbmx5IGNoYW5jZSB0byBmaW5kIHRoZSBhcHAgaWQgaXMgaWYgdGhpcyBpcyBhIGZpbGVcbiAgICAgIC8vIHVwbG9hZCB0aGF0IGFjdHVhbGx5IGlzIGEgSlNPTiBib2R5LiBTbyB0cnkgdG8gcGFyc2UgaXQuXG4gICAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vcGFyc2UtY29tbXVuaXR5L3BhcnNlLXNlcnZlci9pc3N1ZXMvNjU4OVxuICAgICAgLy8gSXQgaXMgYWxzbyBwb3NzaWJsZSB0aGF0IHRoZSBjbGllbnQgaXMgdHJ5aW5nIHRvIHVwbG9hZCBhIGZpbGUgYnV0IGZvcmdvdFxuICAgICAgLy8gdG8gcHJvdmlkZSB4LXBhcnNlLWFwcC1pZCBpbiBoZWFkZXIgYW5kIHBhcnNlIGEgYmluYXJ5IGZpbGUgd2lsbCBmYWlsXG4gICAgICB0cnkge1xuICAgICAgICByZXEuYm9keSA9IEpTT04ucGFyc2UocmVxLmJvZHkpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICByZXR1cm4gaW52YWxpZFJlcXVlc3QocmVxLCByZXMpO1xuICAgICAgfVxuICAgICAgZmlsZVZpYUpTT04gPSB0cnVlO1xuICAgIH1cblxuICAgIGlmIChyZXEuYm9keSkge1xuICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9SZXZvY2FibGVTZXNzaW9uO1xuICAgIH1cblxuICAgIGlmIChcbiAgICAgIHJlcS5ib2R5ICYmXG4gICAgICByZXEuYm9keS5fQXBwbGljYXRpb25JZCAmJlxuICAgICAgQXBwQ2FjaGUuZ2V0KHJlcS5ib2R5Ll9BcHBsaWNhdGlvbklkKSAmJlxuICAgICAgKCFpbmZvLm1hc3RlcktleSB8fCBBcHBDYWNoZS5nZXQocmVxLmJvZHkuX0FwcGxpY2F0aW9uSWQpLm1hc3RlcktleSA9PT0gaW5mby5tYXN0ZXJLZXkpXG4gICAgKSB7XG4gICAgICBpbmZvLmFwcElkID0gcmVxLmJvZHkuX0FwcGxpY2F0aW9uSWQ7XG4gICAgICBpbmZvLmphdmFzY3JpcHRLZXkgPSByZXEuYm9keS5fSmF2YVNjcmlwdEtleSB8fCAnJztcbiAgICAgIGRlbGV0ZSByZXEuYm9keS5fQXBwbGljYXRpb25JZDtcbiAgICAgIGRlbGV0ZSByZXEuYm9keS5fSmF2YVNjcmlwdEtleTtcbiAgICAgIC8vIFRPRE86IHRlc3QgdGhhdCB0aGUgUkVTVCBBUEkgZm9ybWF0cyBnZW5lcmF0ZWQgYnkgdGhlIG90aGVyXG4gICAgICAvLyBTREtzIGFyZSBoYW5kbGVkIG9rXG4gICAgICBpZiAocmVxLmJvZHkuX0NsaWVudFZlcnNpb24pIHtcbiAgICAgICAgaW5mby5jbGllbnRWZXJzaW9uID0gcmVxLmJvZHkuX0NsaWVudFZlcnNpb247XG4gICAgICAgIGRlbGV0ZSByZXEuYm9keS5fQ2xpZW50VmVyc2lvbjtcbiAgICAgIH1cbiAgICAgIGlmIChyZXEuYm9keS5fSW5zdGFsbGF0aW9uSWQpIHtcbiAgICAgICAgaW5mby5pbnN0YWxsYXRpb25JZCA9IHJlcS5ib2R5Ll9JbnN0YWxsYXRpb25JZDtcbiAgICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9JbnN0YWxsYXRpb25JZDtcbiAgICAgIH1cbiAgICAgIGlmIChyZXEuYm9keS5fU2Vzc2lvblRva2VuKSB7XG4gICAgICAgIGluZm8uc2Vzc2lvblRva2VuID0gcmVxLmJvZHkuX1Nlc3Npb25Ub2tlbjtcbiAgICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9TZXNzaW9uVG9rZW47XG4gICAgICB9XG4gICAgICBpZiAocmVxLmJvZHkuX01hc3RlcktleSkge1xuICAgICAgICBpbmZvLm1hc3RlcktleSA9IHJlcS5ib2R5Ll9NYXN0ZXJLZXk7XG4gICAgICAgIGRlbGV0ZSByZXEuYm9keS5fTWFzdGVyS2V5O1xuICAgICAgfVxuICAgICAgaWYgKHJlcS5ib2R5Ll9jb250ZXh0KSB7XG4gICAgICAgIGlmIChyZXEuYm9keS5fY29udGV4dCBpbnN0YW5jZW9mIE9iamVjdCkge1xuICAgICAgICAgIGluZm8uY29udGV4dCA9IHJlcS5ib2R5Ll9jb250ZXh0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBpbmZvLmNvbnRleHQgPSBKU09OLnBhcnNlKHJlcS5ib2R5Ll9jb250ZXh0KTtcbiAgICAgICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoaW5mby5jb250ZXh0KSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICAgICAgICAgICAgdGhyb3cgJ0NvbnRleHQgaXMgbm90IGFuIG9iamVjdCc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgcmV0dXJuIG1hbGZvcm1lZENvbnRleHQocmVxLCByZXMpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBkZWxldGUgcmVxLmJvZHkuX2NvbnRleHQ7XG4gICAgICB9XG4gICAgICBpZiAocmVxLmJvZHkuX0NvbnRlbnRUeXBlKSB7XG4gICAgICAgIHJlcS5oZWFkZXJzWydjb250ZW50LXR5cGUnXSA9IHJlcS5ib2R5Ll9Db250ZW50VHlwZTtcbiAgICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9Db250ZW50VHlwZTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGludmFsaWRSZXF1ZXN0KHJlcSwgcmVzKTtcbiAgICB9XG4gIH1cblxuICBpZiAoaW5mby5zZXNzaW9uVG9rZW4gJiYgdHlwZW9mIGluZm8uc2Vzc2lvblRva2VuICE9PSAnc3RyaW5nJykge1xuICAgIGluZm8uc2Vzc2lvblRva2VuID0gaW5mby5zZXNzaW9uVG9rZW4udG9TdHJpbmcoKTtcbiAgfVxuXG4gIGlmIChpbmZvLmNsaWVudFZlcnNpb24pIHtcbiAgICBpbmZvLmNsaWVudFNESyA9IENsaWVudFNESy5mcm9tU3RyaW5nKGluZm8uY2xpZW50VmVyc2lvbik7XG4gIH1cblxuICBpZiAoZmlsZVZpYUpTT04pIHtcbiAgICByZXEuZmlsZURhdGEgPSByZXEuYm9keS5maWxlRGF0YTtcbiAgICAvLyBXZSBuZWVkIHRvIHJlcG9wdWxhdGUgcmVxLmJvZHkgd2l0aCBhIGJ1ZmZlclxuICAgIHZhciBiYXNlNjQgPSByZXEuYm9keS5iYXNlNjQ7XG4gICAgcmVxLmJvZHkgPSBCdWZmZXIuZnJvbShiYXNlNjQsICdiYXNlNjQnKTtcbiAgfVxuXG4gIGNvbnN0IGNsaWVudElwID0gZ2V0Q2xpZW50SXAocmVxKTtcbiAgY29uc3QgY29uZmlnID0gQ29uZmlnLmdldChpbmZvLmFwcElkLCBtb3VudCk7XG4gIGlmIChjb25maWcuc3RhdGUgJiYgY29uZmlnLnN0YXRlICE9PSAnb2snKSB7XG4gICAgcmVzLnN0YXR1cyg1MDApO1xuICAgIHJlcy5qc29uKHtcbiAgICAgIGNvZGU6IFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUixcbiAgICAgIGVycm9yOiBgSW52YWxpZCBzZXJ2ZXIgc3RhdGU6ICR7Y29uZmlnLnN0YXRlfWAsXG4gICAgfSk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaW5mby5hcHAgPSBBcHBDYWNoZS5nZXQoaW5mby5hcHBJZCk7XG4gIHJlcS5jb25maWcgPSBjb25maWc7XG4gIHJlcS5jb25maWcuaGVhZGVycyA9IHJlcS5oZWFkZXJzIHx8IHt9O1xuICByZXEuY29uZmlnLmlwID0gY2xpZW50SXA7XG4gIHJlcS5pbmZvID0gaW5mbztcblxuICBjb25zdCBpc01haW50ZW5hbmNlID1cbiAgICByZXEuY29uZmlnLm1haW50ZW5hbmNlS2V5ICYmIGluZm8ubWFpbnRlbmFuY2VLZXkgPT09IHJlcS5jb25maWcubWFpbnRlbmFuY2VLZXk7XG4gIGlmIChpc01haW50ZW5hbmNlKSB7XG4gICAgaWYgKGlwUmFuZ2VDaGVjayhjbGllbnRJcCwgcmVxLmNvbmZpZy5tYWludGVuYW5jZUtleUlwcyB8fCBbXSkpIHtcbiAgICAgIHJlcS5hdXRoID0gbmV3IGF1dGguQXV0aCh7XG4gICAgICAgIGNvbmZpZzogcmVxLmNvbmZpZyxcbiAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IGluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgIGlzTWFpbnRlbmFuY2U6IHRydWUsXG4gICAgICB9KTtcbiAgICAgIG5leHQoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgbG9nID0gcmVxLmNvbmZpZz8ubG9nZ2VyQ29udHJvbGxlciB8fCBkZWZhdWx0TG9nZ2VyO1xuICAgIGxvZy5lcnJvcihcbiAgICAgIGBSZXF1ZXN0IHVzaW5nIG1haW50ZW5hbmNlIGtleSByZWplY3RlZCBhcyB0aGUgcmVxdWVzdCBJUCBhZGRyZXNzICcke2NsaWVudElwfScgaXMgbm90IHNldCBpbiBQYXJzZSBTZXJ2ZXIgb3B0aW9uICdtYWludGVuYW5jZUtleUlwcycuYFxuICAgICk7XG4gIH1cblxuICBsZXQgaXNNYXN0ZXIgPSBpbmZvLm1hc3RlcktleSA9PT0gcmVxLmNvbmZpZy5tYXN0ZXJLZXk7XG4gIGlmIChpc01hc3RlciAmJiAhaXBSYW5nZUNoZWNrKGNsaWVudElwLCByZXEuY29uZmlnLm1hc3RlcktleUlwcyB8fCBbXSkpIHtcbiAgICBjb25zdCBsb2cgPSByZXEuY29uZmlnPy5sb2dnZXJDb250cm9sbGVyIHx8IGRlZmF1bHRMb2dnZXI7XG4gICAgbG9nLmVycm9yKFxuICAgICAgYFJlcXVlc3QgdXNpbmcgbWFzdGVyIGtleSByZWplY3RlZCBhcyB0aGUgcmVxdWVzdCBJUCBhZGRyZXNzICcke2NsaWVudElwfScgaXMgbm90IHNldCBpbiBQYXJzZSBTZXJ2ZXIgb3B0aW9uICdtYXN0ZXJLZXlJcHMnLmBcbiAgICApO1xuICAgIGlzTWFzdGVyID0gZmFsc2U7XG4gIH1cblxuICBpZiAoaXNNYXN0ZXIpIHtcbiAgICByZXEuYXV0aCA9IG5ldyBhdXRoLkF1dGgoe1xuICAgICAgY29uZmlnOiByZXEuY29uZmlnLFxuICAgICAgaW5zdGFsbGF0aW9uSWQ6IGluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgICBpc01hc3RlcjogdHJ1ZSxcbiAgICB9KTtcbiAgICByZXR1cm4gaGFuZGxlUmF0ZUxpbWl0KHJlcSwgcmVzLCBuZXh0KTtcbiAgfVxuXG4gIHZhciBpc1JlYWRPbmx5TWFzdGVyID0gaW5mby5tYXN0ZXJLZXkgPT09IHJlcS5jb25maWcucmVhZE9ubHlNYXN0ZXJLZXk7XG4gIGlmIChcbiAgICB0eXBlb2YgcmVxLmNvbmZpZy5yZWFkT25seU1hc3RlcktleSAhPSAndW5kZWZpbmVkJyAmJlxuICAgIHJlcS5jb25maWcucmVhZE9ubHlNYXN0ZXJLZXkgJiZcbiAgICBpc1JlYWRPbmx5TWFzdGVyXG4gICkge1xuICAgIHJlcS5hdXRoID0gbmV3IGF1dGguQXV0aCh7XG4gICAgICBjb25maWc6IHJlcS5jb25maWcsXG4gICAgICBpbnN0YWxsYXRpb25JZDogaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICAgIGlzTWFzdGVyOiB0cnVlLFxuICAgICAgaXNSZWFkT25seTogdHJ1ZSxcbiAgICB9KTtcbiAgICByZXR1cm4gaGFuZGxlUmF0ZUxpbWl0KHJlcSwgcmVzLCBuZXh0KTtcbiAgfVxuXG4gIC8vIENsaWVudCBrZXlzIGFyZSBub3QgcmVxdWlyZWQgaW4gcGFyc2Utc2VydmVyLCBidXQgaWYgYW55IGhhdmUgYmVlbiBjb25maWd1cmVkIGluIHRoZSBzZXJ2ZXIsIHZhbGlkYXRlIHRoZW1cbiAgLy8gIHRvIHByZXNlcnZlIG9yaWdpbmFsIGJlaGF2aW9yLlxuICBjb25zdCBrZXlzID0gWydjbGllbnRLZXknLCAnamF2YXNjcmlwdEtleScsICdkb3ROZXRLZXknLCAncmVzdEFQSUtleSddO1xuICBjb25zdCBvbmVLZXlDb25maWd1cmVkID0ga2V5cy5zb21lKGZ1bmN0aW9uIChrZXkpIHtcbiAgICByZXR1cm4gcmVxLmNvbmZpZ1trZXldICE9PSB1bmRlZmluZWQ7XG4gIH0pO1xuICBjb25zdCBvbmVLZXlNYXRjaGVzID0ga2V5cy5zb21lKGZ1bmN0aW9uIChrZXkpIHtcbiAgICByZXR1cm4gcmVxLmNvbmZpZ1trZXldICE9PSB1bmRlZmluZWQgJiYgaW5mb1trZXldID09PSByZXEuY29uZmlnW2tleV07XG4gIH0pO1xuXG4gIGlmIChvbmVLZXlDb25maWd1cmVkICYmICFvbmVLZXlNYXRjaGVzKSB7XG4gICAgcmV0dXJuIGludmFsaWRSZXF1ZXN0KHJlcSwgcmVzKTtcbiAgfVxuXG4gIGlmIChyZXEudXJsID09ICcvbG9naW4nKSB7XG4gICAgZGVsZXRlIGluZm8uc2Vzc2lvblRva2VuO1xuICB9XG5cbiAgaWYgKHJlcS51c2VyRnJvbUpXVCkge1xuICAgIHJlcS5hdXRoID0gbmV3IGF1dGguQXV0aCh7XG4gICAgICBjb25maWc6IHJlcS5jb25maWcsXG4gICAgICBpbnN0YWxsYXRpb25JZDogaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICAgIGlzTWFzdGVyOiBmYWxzZSxcbiAgICAgIHVzZXI6IHJlcS51c2VyRnJvbUpXVCxcbiAgICB9KTtcbiAgICByZXR1cm4gaGFuZGxlUmF0ZUxpbWl0KHJlcSwgcmVzLCBuZXh0KTtcbiAgfVxuXG4gIGlmICghaW5mby5zZXNzaW9uVG9rZW4pIHtcbiAgICByZXEuYXV0aCA9IG5ldyBhdXRoLkF1dGgoe1xuICAgICAgY29uZmlnOiByZXEuY29uZmlnLFxuICAgICAgaW5zdGFsbGF0aW9uSWQ6IGluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgICBpc01hc3RlcjogZmFsc2UsXG4gICAgfSk7XG4gIH1cbiAgaGFuZGxlUmF0ZUxpbWl0KHJlcSwgcmVzLCBuZXh0KTtcbn1cblxuY29uc3QgaGFuZGxlUmF0ZUxpbWl0ID0gYXN5bmMgKHJlcSwgcmVzLCBuZXh0KSA9PiB7XG4gIGNvbnN0IHJhdGVMaW1pdHMgPSByZXEuY29uZmlnLnJhdGVMaW1pdHMgfHwgW107XG4gIHRyeSB7XG4gICAgYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgICByYXRlTGltaXRzLm1hcChhc3luYyBsaW1pdCA9PiB7XG4gICAgICAgIGNvbnN0IHBhdGhFeHAgPSBuZXcgUmVnRXhwKGxpbWl0LnBhdGgpO1xuICAgICAgICBpZiAocGF0aEV4cC50ZXN0KHJlcS51cmwpKSB7XG4gICAgICAgICAgYXdhaXQgbGltaXQuaGFuZGxlcihyZXEsIHJlcywgZXJyID0+IHtcbiAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgaWYgKGVyci5jb2RlID09PSBQYXJzZS5FcnJvci5DT05ORUNUSU9OX0ZBSUxFRCkge1xuICAgICAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZXEuY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIuZXJyb3IoXG4gICAgICAgICAgICAgICAgJ0FuIHVua25vd24gZXJyb3Igb2NjdXJlZCB3aGVuIGF0dGVtcHRpbmcgdG8gYXBwbHkgdGhlIHJhdGUgbGltaXRlcjogJyxcbiAgICAgICAgICAgICAgICBlcnJcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICApO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIHJlcy5zdGF0dXMoNDI5KTtcbiAgICByZXMuanNvbih7IGNvZGU6IFBhcnNlLkVycm9yLkNPTk5FQ1RJT05fRkFJTEVELCBlcnJvcjogZXJyb3IubWVzc2FnZSB9KTtcbiAgICByZXR1cm47XG4gIH1cbiAgbmV4dCgpO1xufTtcblxuZXhwb3J0IGNvbnN0IGhhbmRsZVBhcnNlU2Vzc2lvbiA9IGFzeW5jIChyZXEsIHJlcywgbmV4dCkgPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IGluZm8gPSByZXEuaW5mbztcbiAgICBpZiAocmVxLmF1dGgpIHtcbiAgICAgIG5leHQoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgbGV0IHJlcXVlc3RBdXRoID0gbnVsbDtcbiAgICBpZiAoXG4gICAgICBpbmZvLnNlc3Npb25Ub2tlbiAmJlxuICAgICAgcmVxLnVybCA9PT0gJy91cGdyYWRlVG9SZXZvY2FibGVTZXNzaW9uJyAmJlxuICAgICAgaW5mby5zZXNzaW9uVG9rZW4uaW5kZXhPZigncjonKSAhPSAwXG4gICAgKSB7XG4gICAgICByZXF1ZXN0QXV0aCA9IGF3YWl0IGF1dGguZ2V0QXV0aEZvckxlZ2FjeVNlc3Npb25Ub2tlbih7XG4gICAgICAgIGNvbmZpZzogcmVxLmNvbmZpZyxcbiAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IGluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgIHNlc3Npb25Ub2tlbjogaW5mby5zZXNzaW9uVG9rZW4sXG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmVxdWVzdEF1dGggPSBhd2FpdCBhdXRoLmdldEF1dGhGb3JTZXNzaW9uVG9rZW4oe1xuICAgICAgICBjb25maWc6IHJlcS5jb25maWcsXG4gICAgICAgIGluc3RhbGxhdGlvbklkOiBpbmZvLmluc3RhbGxhdGlvbklkLFxuICAgICAgICBzZXNzaW9uVG9rZW46IGluZm8uc2Vzc2lvblRva2VuLFxuICAgICAgfSk7XG4gICAgfVxuICAgIHJlcS5hdXRoID0gcmVxdWVzdEF1dGg7XG4gICAgbmV4dCgpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIFBhcnNlLkVycm9yKSB7XG4gICAgICBuZXh0KGVycm9yKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgLy8gVE9ETzogRGV0ZXJtaW5lIHRoZSBjb3JyZWN0IGVycm9yIHNjZW5hcmlvLlxuICAgIHJlcS5jb25maWcubG9nZ2VyQ29udHJvbGxlci5lcnJvcignZXJyb3IgZ2V0dGluZyBhdXRoIGZvciBzZXNzaW9uVG9rZW4nLCBlcnJvcik7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlVOS05PV05fRVJST1IsIGVycm9yKTtcbiAgfVxufTtcblxuZnVuY3Rpb24gZ2V0Q2xpZW50SXAocmVxKSB7XG4gIHJldHVybiByZXEuaXA7XG59XG5cbmZ1bmN0aW9uIGh0dHBBdXRoKHJlcSkge1xuICBpZiAoIShyZXEucmVxIHx8IHJlcSkuaGVhZGVycy5hdXRob3JpemF0aW9uKSByZXR1cm47XG5cbiAgdmFyIGhlYWRlciA9IChyZXEucmVxIHx8IHJlcSkuaGVhZGVycy5hdXRob3JpemF0aW9uO1xuICB2YXIgYXBwSWQsIG1hc3RlcktleSwgamF2YXNjcmlwdEtleTtcblxuICAvLyBwYXJzZSBoZWFkZXJcbiAgdmFyIGF1dGhQcmVmaXggPSAnYmFzaWMgJztcblxuICB2YXIgbWF0Y2ggPSBoZWFkZXIudG9Mb3dlckNhc2UoKS5pbmRleE9mKGF1dGhQcmVmaXgpO1xuXG4gIGlmIChtYXRjaCA9PSAwKSB7XG4gICAgdmFyIGVuY29kZWRBdXRoID0gaGVhZGVyLnN1YnN0cmluZyhhdXRoUHJlZml4Lmxlbmd0aCwgaGVhZGVyLmxlbmd0aCk7XG4gICAgdmFyIGNyZWRlbnRpYWxzID0gZGVjb2RlQmFzZTY0KGVuY29kZWRBdXRoKS5zcGxpdCgnOicpO1xuXG4gICAgaWYgKGNyZWRlbnRpYWxzLmxlbmd0aCA9PSAyKSB7XG4gICAgICBhcHBJZCA9IGNyZWRlbnRpYWxzWzBdO1xuICAgICAgdmFyIGtleSA9IGNyZWRlbnRpYWxzWzFdO1xuXG4gICAgICB2YXIganNLZXlQcmVmaXggPSAnamF2YXNjcmlwdC1rZXk9JztcblxuICAgICAgdmFyIG1hdGNoS2V5ID0ga2V5LmluZGV4T2YoanNLZXlQcmVmaXgpO1xuICAgICAgaWYgKG1hdGNoS2V5ID09IDApIHtcbiAgICAgICAgamF2YXNjcmlwdEtleSA9IGtleS5zdWJzdHJpbmcoanNLZXlQcmVmaXgubGVuZ3RoLCBrZXkubGVuZ3RoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG1hc3RlcktleSA9IGtleTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4geyBhcHBJZDogYXBwSWQsIG1hc3RlcktleTogbWFzdGVyS2V5LCBqYXZhc2NyaXB0S2V5OiBqYXZhc2NyaXB0S2V5IH07XG59XG5cbmZ1bmN0aW9uIGRlY29kZUJhc2U2NChzdHIpIHtcbiAgcmV0dXJuIEJ1ZmZlci5mcm9tKHN0ciwgJ2Jhc2U2NCcpLnRvU3RyaW5nKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhbGxvd0Nyb3NzRG9tYWluKGFwcElkKSB7XG4gIHJldHVybiAocmVxLCByZXMsIG5leHQpID0+IHtcbiAgICBjb25zdCBjb25maWcgPSBDb25maWcuZ2V0KGFwcElkLCBnZXRNb3VudEZvclJlcXVlc3QocmVxKSk7XG4gICAgbGV0IGFsbG93SGVhZGVycyA9IERFRkFVTFRfQUxMT1dFRF9IRUFERVJTO1xuICAgIGlmIChjb25maWcgJiYgY29uZmlnLmFsbG93SGVhZGVycykge1xuICAgICAgYWxsb3dIZWFkZXJzICs9IGAsICR7Y29uZmlnLmFsbG93SGVhZGVycy5qb2luKCcsICcpfWA7XG4gICAgfVxuXG4gICAgY29uc3QgYmFzZU9yaWdpbnMgPVxuICAgICAgdHlwZW9mIGNvbmZpZz8uYWxsb3dPcmlnaW4gPT09ICdzdHJpbmcnID8gW2NvbmZpZy5hbGxvd09yaWdpbl0gOiBjb25maWc/LmFsbG93T3JpZ2luID8/IFsnKiddO1xuICAgIGNvbnN0IHJlcXVlc3RPcmlnaW4gPSByZXEuaGVhZGVycy5vcmlnaW47XG4gICAgY29uc3QgYWxsb3dPcmlnaW5zID1cbiAgICAgIHJlcXVlc3RPcmlnaW4gJiYgYmFzZU9yaWdpbnMuaW5jbHVkZXMocmVxdWVzdE9yaWdpbikgPyByZXF1ZXN0T3JpZ2luIDogYmFzZU9yaWdpbnNbMF07XG4gICAgcmVzLmhlYWRlcignQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJywgYWxsb3dPcmlnaW5zKTtcbiAgICByZXMuaGVhZGVyKCdBY2Nlc3MtQ29udHJvbC1BbGxvdy1NZXRob2RzJywgJ0dFVCxQVVQsUE9TVCxERUxFVEUsT1BUSU9OUycpO1xuICAgIHJlcy5oZWFkZXIoJ0FjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnMnLCBhbGxvd0hlYWRlcnMpO1xuICAgIHJlcy5oZWFkZXIoJ0FjY2Vzcy1Db250cm9sLUV4cG9zZS1IZWFkZXJzJywgJ1gtUGFyc2UtSm9iLVN0YXR1cy1JZCwgWC1QYXJzZS1QdXNoLVN0YXR1cy1JZCcpO1xuICAgIC8vIGludGVyY2VwdCBPUFRJT05TIG1ldGhvZFxuICAgIGlmICgnT1BUSU9OUycgPT0gcmVxLm1ldGhvZCkge1xuICAgICAgcmVzLnNlbmRTdGF0dXMoMjAwKTtcbiAgICB9IGVsc2Uge1xuICAgICAgbmV4dCgpO1xuICAgIH1cbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFsbG93TWV0aG9kT3ZlcnJpZGUocmVxLCByZXMsIG5leHQpIHtcbiAgaWYgKHJlcS5tZXRob2QgPT09ICdQT1NUJyAmJiByZXEuYm9keS5fbWV0aG9kKSB7XG4gICAgcmVxLm9yaWdpbmFsTWV0aG9kID0gcmVxLm1ldGhvZDtcbiAgICByZXEubWV0aG9kID0gcmVxLmJvZHkuX21ldGhvZDtcbiAgICBkZWxldGUgcmVxLmJvZHkuX21ldGhvZDtcbiAgfVxuICBuZXh0KCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoYW5kbGVQYXJzZUVycm9ycyhlcnIsIHJlcSwgcmVzLCBuZXh0KSB7XG4gIGNvbnN0IGxvZyA9IChyZXEuY29uZmlnICYmIHJlcS5jb25maWcubG9nZ2VyQ29udHJvbGxlcikgfHwgZGVmYXVsdExvZ2dlcjtcbiAgaWYgKGVyciBpbnN0YW5jZW9mIFBhcnNlLkVycm9yKSB7XG4gICAgaWYgKHJlcS5jb25maWcgJiYgcmVxLmNvbmZpZy5lbmFibGVFeHByZXNzRXJyb3JIYW5kbGVyKSB7XG4gICAgICByZXR1cm4gbmV4dChlcnIpO1xuICAgIH1cbiAgICBsZXQgaHR0cFN0YXR1cztcbiAgICAvLyBUT0RPOiBmaWxsIG91dCB0aGlzIG1hcHBpbmdcbiAgICBzd2l0Y2ggKGVyci5jb2RlKSB7XG4gICAgICBjYXNlIFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUjpcbiAgICAgICAgaHR0cFN0YXR1cyA9IDUwMDtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQ6XG4gICAgICAgIGh0dHBTdGF0dXMgPSA0MDQ7XG4gICAgICAgIGJyZWFrO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgaHR0cFN0YXR1cyA9IDQwMDtcbiAgICB9XG4gICAgcmVzLnN0YXR1cyhodHRwU3RhdHVzKTtcbiAgICByZXMuanNvbih7IGNvZGU6IGVyci5jb2RlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgbG9nLmVycm9yKCdQYXJzZSBlcnJvcjogJywgZXJyKTtcbiAgfSBlbHNlIGlmIChlcnIuc3RhdHVzICYmIGVyci5tZXNzYWdlKSB7XG4gICAgcmVzLnN0YXR1cyhlcnIuc3RhdHVzKTtcbiAgICByZXMuanNvbih7IGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICBpZiAoIShwcm9jZXNzICYmIHByb2Nlc3MuZW52LlRFU1RJTkcpKSB7XG4gICAgICBuZXh0KGVycik7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGxvZy5lcnJvcignVW5jYXVnaHQgaW50ZXJuYWwgc2VydmVyIGVycm9yLicsIGVyciwgZXJyLnN0YWNrKTtcbiAgICByZXMuc3RhdHVzKDUwMCk7XG4gICAgcmVzLmpzb24oe1xuICAgICAgY29kZTogUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLFxuICAgICAgbWVzc2FnZTogJ0ludGVybmFsIHNlcnZlciBlcnJvci4nLFxuICAgIH0pO1xuICAgIGlmICghKHByb2Nlc3MgJiYgcHJvY2Vzcy5lbnYuVEVTVElORykpIHtcbiAgICAgIG5leHQoZXJyKTtcbiAgICB9XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MocmVxLCByZXMsIG5leHQpIHtcbiAgaWYgKCFyZXEuYXV0aC5pc01hc3Rlcikge1xuICAgIHJlcy5zdGF0dXMoNDAzKTtcbiAgICByZXMuZW5kKCd7XCJlcnJvclwiOlwidW5hdXRob3JpemVkOiBtYXN0ZXIga2V5IGlzIHJlcXVpcmVkXCJ9Jyk7XG4gICAgcmV0dXJuO1xuICB9XG4gIG5leHQoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzKHJlcXVlc3QpIHtcbiAgaWYgKCFyZXF1ZXN0LmF1dGguaXNNYXN0ZXIpIHtcbiAgICBjb25zdCBlcnJvciA9IG5ldyBFcnJvcigpO1xuICAgIGVycm9yLnN0YXR1cyA9IDQwMztcbiAgICBlcnJvci5tZXNzYWdlID0gJ3VuYXV0aG9yaXplZDogbWFzdGVyIGtleSBpcyByZXF1aXJlZCc7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xufVxuXG5leHBvcnQgY29uc3QgYWRkUmF0ZUxpbWl0ID0gKHJvdXRlLCBjb25maWcsIGNsb3VkKSA9PiB7XG4gIGlmICh0eXBlb2YgY29uZmlnID09PSAnc3RyaW5nJykge1xuICAgIGNvbmZpZyA9IENvbmZpZy5nZXQoY29uZmlnKTtcbiAgfVxuICBmb3IgKGNvbnN0IGtleSBpbiByb3V0ZSkge1xuICAgIGlmICghUmF0ZUxpbWl0T3B0aW9uc1trZXldKSB7XG4gICAgICB0aHJvdyBgSW52YWxpZCByYXRlIGxpbWl0IG9wdGlvbiBcIiR7a2V5fVwiYDtcbiAgICB9XG4gIH1cbiAgaWYgKCFjb25maWcucmF0ZUxpbWl0cykge1xuICAgIGNvbmZpZy5yYXRlTGltaXRzID0gW107XG4gIH1cbiAgY29uc3QgcmVkaXNTdG9yZSA9IHtcbiAgICBjb25uZWN0aW9uUHJvbWlzZTogUHJvbWlzZS5yZXNvbHZlKCksXG4gICAgc3RvcmU6IG51bGwsXG4gICAgY29ubmVjdGVkOiBmYWxzZSxcbiAgfTtcbiAgaWYgKHJvdXRlLnJlZGlzVXJsKSB7XG4gICAgY29uc3QgY2xpZW50ID0gY3JlYXRlQ2xpZW50KHtcbiAgICAgIHVybDogcm91dGUucmVkaXNVcmwsXG4gICAgfSk7XG4gICAgcmVkaXNTdG9yZS5jb25uZWN0aW9uUHJvbWlzZSA9IGFzeW5jICgpID0+IHtcbiAgICAgIGlmIChyZWRpc1N0b3JlLmNvbm5lY3RlZCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCBjbGllbnQuY29ubmVjdCgpO1xuICAgICAgICByZWRpc1N0b3JlLmNvbm5lY3RlZCA9IHRydWU7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnN0IGxvZyA9IGNvbmZpZz8ubG9nZ2VyQ29udHJvbGxlciB8fCBkZWZhdWx0TG9nZ2VyO1xuICAgICAgICBsb2cuZXJyb3IoYENvdWxkIG5vdCBjb25uZWN0IHRvIHJlZGlzVVJMIGluIHJhdGUgbGltaXQ6ICR7ZX1gKTtcbiAgICAgIH1cbiAgICB9O1xuICAgIHJlZGlzU3RvcmUuY29ubmVjdGlvblByb21pc2UoKTtcbiAgICByZWRpc1N0b3JlLnN0b3JlID0gbmV3IFJlZGlzU3RvcmUoe1xuICAgICAgc2VuZENvbW1hbmQ6IGFzeW5jICguLi5hcmdzKSA9PiB7XG4gICAgICAgIGF3YWl0IHJlZGlzU3RvcmUuY29ubmVjdGlvblByb21pc2UoKTtcbiAgICAgICAgcmV0dXJuIGNsaWVudC5zZW5kQ29tbWFuZChhcmdzKTtcbiAgICAgIH0sXG4gICAgfSk7XG4gIH1cbiAgY29uZmlnLnJhdGVMaW1pdHMucHVzaCh7XG4gICAgcGF0aDogcGF0aFRvUmVnZXhwKHJvdXRlLnJlcXVlc3RQYXRoKSxcbiAgICBoYW5kbGVyOiByYXRlTGltaXQoe1xuICAgICAgd2luZG93TXM6IHJvdXRlLnJlcXVlc3RUaW1lV2luZG93LFxuICAgICAgbWF4OiByb3V0ZS5yZXF1ZXN0Q291bnQsXG4gICAgICBtZXNzYWdlOiByb3V0ZS5lcnJvclJlc3BvbnNlTWVzc2FnZSB8fCBSYXRlTGltaXRPcHRpb25zLmVycm9yUmVzcG9uc2VNZXNzYWdlLmRlZmF1bHQsXG4gICAgICBoYW5kbGVyOiAocmVxdWVzdCwgcmVzcG9uc2UsIG5leHQsIG9wdGlvbnMpID0+IHtcbiAgICAgICAgdGhyb3cge1xuICAgICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLkNPTk5FQ1RJT05fRkFJTEVELFxuICAgICAgICAgIG1lc3NhZ2U6IG9wdGlvbnMubWVzc2FnZSxcbiAgICAgICAgfTtcbiAgICAgIH0sXG4gICAgICBza2lwOiByZXF1ZXN0ID0+IHtcbiAgICAgICAgaWYgKHJlcXVlc3QuaXAgPT09ICcxMjcuMC4wLjEnICYmICFyb3V0ZS5pbmNsdWRlSW50ZXJuYWxSZXF1ZXN0cykge1xuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChyb3V0ZS5pbmNsdWRlTWFzdGVyS2V5KSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChyb3V0ZS5yZXF1ZXN0TWV0aG9kcykge1xuICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KHJvdXRlLnJlcXVlc3RNZXRob2RzKSkge1xuICAgICAgICAgICAgaWYgKCFyb3V0ZS5yZXF1ZXN0TWV0aG9kcy5pbmNsdWRlcyhyZXF1ZXN0Lm1ldGhvZCkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IHJlZ0V4cCA9IG5ldyBSZWdFeHAocm91dGUucmVxdWVzdE1ldGhvZHMpO1xuICAgICAgICAgICAgaWYgKCFyZWdFeHAudGVzdChyZXF1ZXN0Lm1ldGhvZCkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXF1ZXN0LmF1dGg/LmlzTWFzdGVyO1xuICAgICAgfSxcbiAgICAgIGtleUdlbmVyYXRvcjogcmVxdWVzdCA9PiB7XG4gICAgICAgIHJldHVybiByZXF1ZXN0LmNvbmZpZy5pcDtcbiAgICAgIH0sXG4gICAgICBzdG9yZTogcmVkaXNTdG9yZS5zdG9yZSxcbiAgICB9KSxcbiAgICBjbG91ZCxcbiAgfSk7XG4gIENvbmZpZy5wdXQoY29uZmlnKTtcbn07XG5cbi8qKlxuICogRGVkdXBsaWNhdGVzIGEgcmVxdWVzdCB0byBlbnN1cmUgaWRlbXBvdGVuY3kuIER1cGxpY2F0ZXMgYXJlIGRldGVybWluZWQgYnkgdGhlIHJlcXVlc3QgSURcbiAqIGluIHRoZSByZXF1ZXN0IGhlYWRlci4gSWYgYSByZXF1ZXN0IGhhcyBubyByZXF1ZXN0IElELCBpdCBpcyBleGVjdXRlZCBhbnl3YXkuXG4gKiBAcGFyYW0geyp9IHJlcSBUaGUgcmVxdWVzdCB0byBldmFsdWF0ZS5cbiAqIEByZXR1cm5zIFByb21pc2U8e30+XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3kocmVxKSB7XG4gIC8vIEVuYWJsZSBmZWF0dXJlIG9ubHkgZm9yIE1vbmdvREJcbiAgaWYgKFxuICAgICEoXG4gICAgICByZXEuY29uZmlnLmRhdGFiYXNlLmFkYXB0ZXIgaW5zdGFuY2VvZiBNb25nb1N0b3JhZ2VBZGFwdGVyIHx8XG4gICAgICByZXEuY29uZmlnLmRhdGFiYXNlLmFkYXB0ZXIgaW5zdGFuY2VvZiBQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyXG4gICAgKVxuICApIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbiAgLy8gR2V0IHBhcmFtZXRlcnNcbiAgY29uc3QgY29uZmlnID0gcmVxLmNvbmZpZztcbiAgY29uc3QgcmVxdWVzdElkID0gKChyZXEgfHwge30pLmhlYWRlcnMgfHwge30pWyd4LXBhcnNlLXJlcXVlc3QtaWQnXTtcbiAgY29uc3QgeyBwYXRocywgdHRsIH0gPSBjb25maWcuaWRlbXBvdGVuY3lPcHRpb25zO1xuICBpZiAoIXJlcXVlc3RJZCB8fCAhY29uZmlnLmlkZW1wb3RlbmN5T3B0aW9ucykge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuICAvLyBSZXF1ZXN0IHBhdGggbWF5IGNvbnRhaW4gdHJhaWxpbmcgc2xhc2hlcywgZGVwZW5kaW5nIG9uIHRoZSBvcmlnaW5hbCByZXF1ZXN0LCBzbyByZW1vdmVcbiAgLy8gbGVhZGluZyBhbmQgdHJhaWxpbmcgc2xhc2hlcyB0byBtYWtlIGl0IGVhc2llciB0byBzcGVjaWZ5IHBhdGhzIGluIHRoZSBjb25maWd1cmF0aW9uXG4gIGNvbnN0IHJlcVBhdGggPSByZXEucGF0aC5yZXBsYWNlKC9eXFwvfFxcLyQvLCAnJyk7XG4gIC8vIERldGVybWluZSB3aGV0aGVyIGlkZW1wb3RlbmN5IGlzIGVuYWJsZWQgZm9yIGN1cnJlbnQgcmVxdWVzdCBwYXRoXG4gIGxldCBtYXRjaCA9IGZhbHNlO1xuICBmb3IgKGNvbnN0IHBhdGggb2YgcGF0aHMpIHtcbiAgICAvLyBBc3N1bWUgb25lIHdhbnRzIGEgcGF0aCB0byBhbHdheXMgbWF0Y2ggZnJvbSB0aGUgYmVnaW5uaW5nIHRvIHByZXZlbnQgYW55IG1pc3Rha2VzXG4gICAgY29uc3QgcmVnZXggPSBuZXcgUmVnRXhwKHBhdGguY2hhckF0KDApID09PSAnXicgPyBwYXRoIDogJ14nICsgcGF0aCk7XG4gICAgaWYgKHJlcVBhdGgubWF0Y2gocmVnZXgpKSB7XG4gICAgICBtYXRjaCA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICB9XG4gIH1cbiAgaWYgKCFtYXRjaCkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuICAvLyBUcnkgdG8gc3RvcmUgcmVxdWVzdFxuICBjb25zdCBleHBpcnlEYXRlID0gbmV3IERhdGUobmV3IERhdGUoKS5zZXRTZWNvbmRzKG5ldyBEYXRlKCkuZ2V0U2Vjb25kcygpICsgdHRsKSk7XG4gIHJldHVybiByZXN0XG4gICAgLmNyZWF0ZShjb25maWcsIGF1dGgubWFzdGVyKGNvbmZpZyksICdfSWRlbXBvdGVuY3knLCB7XG4gICAgICByZXFJZDogcmVxdWVzdElkLFxuICAgICAgZXhwaXJlOiBQYXJzZS5fZW5jb2RlKGV4cGlyeURhdGUpLFxuICAgIH0pXG4gICAgLmNhdGNoKGUgPT4ge1xuICAgICAgaWYgKGUuY29kZSA9PSBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkRVUExJQ0FURV9SRVFVRVNULCAnRHVwbGljYXRlIHJlcXVlc3QnKTtcbiAgICAgIH1cbiAgICAgIHRocm93IGU7XG4gICAgfSk7XG59XG5cbmZ1bmN0aW9uIGludmFsaWRSZXF1ZXN0KHJlcSwgcmVzKSB7XG4gIHJlcy5zdGF0dXMoNDAzKTtcbiAgcmVzLmVuZCgne1wiZXJyb3JcIjpcInVuYXV0aG9yaXplZFwifScpO1xufVxuXG5mdW5jdGlvbiBtYWxmb3JtZWRDb250ZXh0KHJlcSwgcmVzKSB7XG4gIHJlcy5zdGF0dXMoNDAwKTtcbiAgcmVzLmpzb24oeyBjb2RlOiBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGVycm9yOiAnSW52YWxpZCBvYmplY3QgZm9yIGNvbnRleHQuJyB9KTtcbn1cbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FB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