import "./styles.css";

const path = window.location.pathname.replace(/\/$/, "") || "/";
const studioAnalyzerRe = /^\/studio\/analyzer\/[^/]+$/;

if (studioAnalyzerRe.test(path)) {
  import("./studio/bootstrap.tsx").then((m) => m.mountStudioAnalyzer());
} else {
  import("./app.js");
}
