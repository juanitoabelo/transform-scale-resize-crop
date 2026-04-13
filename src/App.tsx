import { ImageEditor } from "./ImageEditor";

function App() {
  return (
    <div className="app-shell min-vh-100 d-flex flex-column">
      <nav className="navbar navbar-expand-lg navbar-dark app-nav shadow-sm">
        <div className="container">
          <span className="navbar-brand fw-semibold d-flex align-items-center gap-2">
            <span className="app-dot" />
            Transform &amp; Crop
          </span>
          <span className="navbar-text text-white-50 small d-none d-sm-inline">
            React + Bootstrap · canvas pipeline
          </span>
        </div>
      </nav>

      <main className="container flex-grow-1 py-4 py-lg-5">
        <ImageEditor />
      </main>

      <footer className="border-top py-3 app-footer">
        <div className="container small text-secondary">
          Images stay in your browser — nothing is uploaded.
        </div>
      </footer>
    </div>
  );
}

export default App;
