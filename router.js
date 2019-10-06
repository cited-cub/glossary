var { parse } = require("url");

module.exports = class Router {
  constructor() {
    this.routes = [];
  }
  add(method, url, handler) {
    this.routes.push({ method, url, handler });
  }
  resolve(context, request) {
    let path = parse(request.url).pathname;

    for (let { method, url, handler } of this.routes) {
      console.log('trying to match', request.method, path, 'with', method, url);
      let match = url.exec(path);
      if (!match || request.method != method) continue;
      let urlParts = match.slice(1).map(decodeURIComponent);
      console.log('Match! Running handler', ...urlParts);
      return handler(context, ...urlParts, request);
    }
    console.log('No match')
    return null;
  }
};
