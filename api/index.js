// Punkt wejścia funkcji serverless na Vercelu (Vercel wymaga katalogu api/ w korzeniu repozytorium).
// Cała logika jest w src/server/ — tu tylko re-eksport aplikacji Express.
export { default } from "../src/server/app.js";
