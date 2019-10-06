function handleAction(state, action) {
  if (action.type == "setUser") {
    localStorage.setItem("userName", action.user);
    return Object.assign({}, state, { user: action.user });
  } else if (action.type == "setGlossary") {
    return Object.assign({}, state, { glossary: action.glossary });
  } else if (action.type == "newWord") {
    fetchOK(wordURL(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        local: action.local,
        foreign: action.foreign
      })
    })
      .catch(error => reportError(error, 'handleAction'))
      .then(response => response.json())
      .then(glossary => {
        app.dispatch({ type: "setGlossary", glossary });
      });
  } else if (action.type == "updateWord") {
    fetchOK(wordURL(action.id), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: action.id,
        local: action.local,
        foreign: action.foreign
      })
    })
      .catch(error => reportError(error, 'handleAction'))
      .then(response => response.json())
      .then(glossary => {
        app.dispatch({ type: "setGlossary", glossary });
      });
  } else if (action.type == "deleteWord") {
    console.log('deleteWord', action.id);
    fetchOK(wordURL(action.id), { method: "DELETE" })
      .catch(reportError)
      .then(response => response.json())
      .then(glossary => {
        app.dispatch({ type: "setGlossary", glossary });
      });
  }
  return state;
}

function fetchOK(url, options) {
  return fetch(url, options).then(response => {
    if (response.status < 400) return response;
    else throw new Error(response.statusText);
  })
}

function wordURL(id) {
  return "glossary" + (id ? "/" + encodeURIComponent(id) : "");
}

function reportError(error, text = '') {
  alert(text + ':' + String(error));
}

function renderUserField(name, dispatch) {
  return elt("label", {}, "Your name: ", elt("input", {
    type: "text",
    value: name,
    onchange(event) {
      dispatch({ type: "setUser", user: event.target.value });
    }
  }));
}

function elt(type, props, ...children) {
  let dom = document.createElement(type);
  if (props) Object.assign(dom, props);
  for (let child of children) {
    if (typeof child != "string") dom.appendChild(child);
    else dom.appendChild(document.createTextNode(child));
  }
  return dom;
}

function renderWord(word, dispatch) {
  console.log('renderWord', word);
  return elt(
    "section", { className: "word" },
    elt("div", null,
      elt("input", { type: "text", className: "local", value: word.local }),
      elt("input", { type: "text", className: "foreign", value: word.foreign }),
      elt("button",
        {
          type: "button",
          onclick() {
            app.dispatch({
              type: "updateWord",
              id: word.id,
              local: this.parentNode.querySelector('input.local').value,
              foreign: this.parentNode.querySelector('input.foreign').value
            });
          }
        },
        "Update"
      ),
      elt("button",
        {
          type: "button",
          onclick() {
            app.dispatch({ type: "deleteWord", id: word.id });
          }
        },
        "Delete"
      )
    )
  )
}

function renderGlossaryForm(dispatch) {
  let local = elt("input", { type: "text" });
  let foreign = elt("input", { type: "text" });
  return elt("form", {
    onsubmit(event) {
      event.preventDefault();
      dispatch({
        type: "newWord",
        local: local.value,
        foreign: foreign.value
      });
      event.target.reset();
      const localInput = document.querySelector(".local");
      console.log(localInput);
      localInput.focus();
    }
  }, elt("h3", null, "Submit a word"),
    elt("label", { className: "local" }, "Local: ", local),
    elt("label", { className: "foreign" }, "Foreign: ", foreign),
    elt("button", { type: "submit" }, "Submit")
  );
}

// async function pollGlossary(update) {
//   let response;
//   try {
//     response = await fetchOK("/glossary");
//   } catch (e) {
//     console.log("Request failed: " + e);
//     await new Promise(resolve => setTimeout(resolve, 500));
//   }
//   let responseJson = await response.json();
//   update(responseJson);
// }

var GlossaryApp = class GlossaryApp {
  constructor(state, dispatch) {
    this.dispatch = dispatch;
    this.glossaryDOM = elt("div", { className: "glossary" });
    this.dom = elt("div", null,
      renderUserField(state.user, dispatch),
      renderGlossaryForm(dispatch),
      this.glossaryDOM
    );
    this.syncState(state);
  }

  syncState(state) {
    if (state.glossary != this.glossary) {
      console.table(state.glossary);
      this.glossaryDOM.textContent = "";
      for (let word of state.glossary) {
        console.log('word', word);
        this.glossaryDOM.insertBefore(
          renderWord(word, this.dispatch),
          this.glossaryDOM.firstChild
        );
      }
      this.glossary = state.glossary;
    }
  }
}

let app;

function runApp() {
  let user = localStorage.getItem("userName") || "Anton";
  let state;
  function dispatch(action) {
    state = handleAction(state, action);
    app.syncState(state);
  }


  async function insteadOfPoll() {
    let response;
    try {
      response = await fetchOK("/glossary", {
        headers: {}
      });
    } catch (e) {
      console.log("Request failed: " + e);
      return;
    }
    let glossary = await response.json();
    state = { user, glossary };
    app = new GlossaryApp(state, dispatch);
    document.body.appendChild(app.dom);
  }
  insteadOfPoll();
  // Poll for glossary, supplying a callback handling the received glossary
  // pollGlossary(glossary => {
  //   if (!app) {
  //     state = { user, glossary };
  //     app = new GlossaryApp(state, dispatch);
  //     document.body.appendChild(app.dom);
  //   } else {
  //     dispatch({ type: "setGlossary", glossary });
  //   }
  // }).catch(error => reportError(error, 'pollGlossary'));
}

runApp();