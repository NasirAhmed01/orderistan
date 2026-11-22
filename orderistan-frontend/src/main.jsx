import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles.css";
import "./styles-extra.css";
import "./styles-v3.css";
import "./styles-chat.css";
import "./styles-premium.css";
import "./styles-skeleton.css";
import "./styles-fit.css";
import "./styles-v11.css";
import "./styles-v12.css";
import "./styles-fashion.css"; // clothing storefront redesign
import "./styles-services.css"; // service storefront (dark glow design) - keep these two last so they win ties
import { startFx } from "./fx";
createRoot(document.getElementById("root")).render(<BrowserRouter><App /></BrowserRouter>);
startFx();
