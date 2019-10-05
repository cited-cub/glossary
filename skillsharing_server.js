var { createServer } = require("http");
var Router = require("./router");
var ecstatic = require("ecstatic");
const { readFileSync, writeFile } = require("fs");

const fileName = "./glossary.json";

var router = new Router();
var defaultHeaders = { "Content-Type": "text/plain" };

var SkillShareServer = class SkillShareServer {
  constructor(talks, glossary) {
    this.talks = talks;
    this.glossary = glossary;
    this.version = 0;
    this.waiting = [];

    let fileServer = ecstatic({ root: "./public" });
    this.server = createServer((request, response) => {
      // Set 'resolved' to promise returned from 'waitForChanges()'
      let resolved = router.resolve(this, request);
      if (resolved) {
        resolved
          // If error, respond with code 500
          .catch(error => {
            if (error.status != null) return error;
            return { body: String(error), status: 500 };
          })
          // If resolved, respond with body and code 200
          .then(({ body, status = 200, headers = defaultHeaders }) => {
            response.writeHead(status, headers);
            response.end(body);
          });
      } else {
        fileServer(request, response);
      }
    });
  }
  start(port) {
    this.server.listen(port);
  }
  stop() {
    this.server.close();
  }
}

const talkPath = /^\/talks\/([^\/]+)$/;
router.add("GET", talkPath, async (server, title) => {
  if (title in server.talks) {
    return {
      body: JSON.stringify(server.talks[title]),
      headers: { "Content-Type": "application/json" }
    };
  } else {
    return { status: 404, body: `No talk '${title}' found` };
  }
});

const wordPath = /^\/glossary\/([^\/]+)$/;
router.add("GET", wordPath, async (server, word) => {
  if (word in server.glossary) {
    return {
      body: JSON.stringify(server.glossary[word]),
      headers: { "Content-Type": "application/json" }
    };
  } else {
    return { status: 404, body: `No word '${word}' found` };
  }
});

router.add("DELETE", talkPath, async (server, title) => {
  if (title in server.talks) {
    delete server.talks[title];
    server.updated();
  }
  return { status: 204 };
});

router.add("DELETE", wordPath, async (server, wordPair) => {
  console.log('Deleting', wordPair);
  if (wordPair in server.glossary) {
    delete server.glossary[wordPair];
    server.glossaryUpdated();
  }
  console.table(server.glossary);
  return server.glossaryResponse();
})

function readStream(stream) {
  return new Promise((resolve, reject) => {
    let data = "";
    stream.on("error", reject);
    stream.on("data", chunk => data += chunk.toString());
    stream.on("end", () => resolve(data));
  });
}

router.add("PUT", talkPath,
  async (server, title, request) => {
    let requestBody = await readStream(request);
    let talk;
    try { talk = JSON.parse(requestBody); }
    catch (_) { return { status: 400, body: "Invalid JSON" }; }

    if (!talk ||
      typeof talk.presenter != "string" ||
      typeof talk.summary != "string") {
      return { status: 400, body: "Bad talk data" };
    }
    server.talks[title] = {
      title,
      presenter: talk.presenter,
      summary: talk.summary,
      comments: []
    };
    server.updated();
    return { status: 204 };
  });

router.add("PUT", wordPath,
  async (server, wordPair, request) => {
    let requestBody = await readStream(request);
    let word;
    try { word = JSON.parse(requestBody); }
    catch (_) { return { status: 400, body: "Invalid JSON" }; }

    if (!word ||
      typeof word.wordPair != "string" ||
      typeof word.local != "string" ||
      typeof word.foreign != "string") {
      return { status: 400, body: "Bad word data" };
    }
    server.glossary[wordPair] = {
      wordPair: word.wordPair,
      local: word.local,
      foreign: word.foreign
    };
    console.table(server.glossary);
    server.glossaryUpdated();
    return server.glossaryResponse();
  });

router.add("POST", /^\/talks\/([^\/]+)\/comments$/,
  async (server, title, request) => {
    let requestBody = await readStream(request);
    let comment;
    try { comment = JSON.parse(requestBody); }
    catch (_) { return { status: 400, body: "Invalid JSON" }; }

    if (!comment ||
      typeof comment.author != "string" ||
      typeof comment.message != "string") {
      return { status: 400, body: "Bad comment data" };
    } else if (title in server.talks) {
      server.talks[title].comments.push(comment);
      server.updated();
      return { status: 204 };
    } else {
      return { status: 404, body: `No talk '${title}' found` };
    }
  });

SkillShareServer.prototype.talkResponse = function () {
  let talks = [];
  for (let title of Object.keys(this.talks)) {
    talks.push(this.talks[title]);
  }
  return {
    body: JSON.stringify(talks),
    headers: {
      "Content-Type": "application/json",
      "ETag": `"${this.version}"`
    }
  };
};

SkillShareServer.prototype.glossaryResponse = function () {
  let glossary = [];
  for (let word of Object.keys(this.glossary)) {
    glossary.push(this.glossary[word]);
  }
  return {
    body: JSON.stringify(glossary),
    headers: {}
  };
};

router.add("GET", /^\/talks$/, async (server, request) => {
  let tag = /"(.*)"/.exec(request.headers["if-none-match"]);
  let wait = /\bwait=(\d+)/.exec(request.headers["prefer"]);
  if (!tag || tag[1] != server.version) {
    return server.talkResponse();
  } else if (!wait) {
    return { status: 304 };
  } else {
    return server.waitForChanges(Number(wait[1]));
  }
});

router.add("GET", /^\/glossary$/, async (server, request) => {
  return server.glossaryResponse();
});

SkillShareServer.prototype.waitForChanges = function (time) {
  // Create a promise running a function that waits a maximum
  // of 'time' secs before resolving
  return new Promise(resolve => {
    // Store resolve function in waiting array
    this.waiting.push(resolve);
    // Run after 'time' seconds
    setTimeout(() => {
      // Check if waiting array doesn't contain resolve function
      if (!this.waiting.includes(resolve)) return;
      // Remove resolve function from waiting array
      this.waiting = this.waiting.filter(r => r != resolve);
      // Resolve promise with status code 304
      resolve({ status: 304 });
    }, time * 1000);
  });
};

function loadGlossary() {
  let json;
  try {
    json = JSON.parse(readFileSync(fileName, "utf8"));
  } catch (e) {
    json = {};
  }
  return Object.assign(Object.create(null), json);
}

SkillShareServer.prototype.updated = function () {
  this.version++;
  let response = this.talkResponse();
  // Resolve all waiting promises with talk response
  this.waiting.forEach(resolve => resolve(response));
  // Clear waiting array
  this.waiting = [];
};

SkillShareServer.prototype.glossaryUpdated = function () {
  writeFile(fileName, JSON.stringify(this.glossary), e => {
    if (e) throw e;
  });
};

new SkillShareServer(Object.create(null), loadGlossary()).start(8000);
