
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import App from "./App.tsx";
import MarivexIntro from "./components/MarivexIntro.tsx";

import "./index.css";

// MARIVEX page navigation
// #explorer = Ocean Explorer
// No hash = MARIVEX Home

function MarivexWebsite() {
  const [showIntro, setShowIntro] = useState<boolean>(
    () => window.location.hash !== "#explorer"
  );

  // Synchronize React with browser navigation.
  useEffect(() => {
    const handleNavigation = () => {
      const isExplorer =
        window.location.hash === "#explorer";

      setShowIntro(!isExplorer);

      window.scrollTo(0, 0);
    };

    window.addEventListener(
      "hashchange",
      handleNavigation
    );

    // Restore the correct page after refresh.
    handleNavigation();

    return () => {
      window.removeEventListener(
        "hashchange",
        handleNavigation
      );
    };
  }, []);

  // Enter the Explorer from the welcome page.
  function enterWebsite() {
    // Changing the hash creates a browser history entry.
    window.location.hash = "explorer";

    setShowIntro(false);
    window.scrollTo(0, 0);
  }

  return (
    <>
      {showIntro ? (
        <MarivexIntro onEnter={enterWebsite} />
      ) : (
        <App />
      )}
    </>
  );
}

createRoot(
  document.getElementById("root")!
).render(
  <MarivexWebsite />
);
