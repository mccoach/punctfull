import "./styles.css";
import { initUI } from "./app/ui";
import { registerSW } from "virtual:pwa-register";

initUI(document.getElementById("app")!);

registerSW({
  immediate: true
});
