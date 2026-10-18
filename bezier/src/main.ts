import { initPlayground } from "./playground"
import { initOrbit } from "./orbit3d"

// Theme toggle: cycles system -> light -> dark, remembered per browser.
const root = document.documentElement
const btn = document.getElementById("theme-toggle") as HTMLButtonElement
const labels: Record<string, string> = { system: "Auto", light: "Light", dark: "Dark" }
const apply = (mode: string) => {
  if (mode === "system") root.removeAttribute("data-theme")
  else root.setAttribute("data-theme", mode)
  btn.querySelector(".label")!.textContent = labels[mode]
  btn.setAttribute("aria-label", `Colour theme: ${labels[mode]}. Click to change.`)
}
let mode = "system"
try {
  mode = localStorage.getItem("bf-theme") || "system"
} catch {}
if (root.hasAttribute("data-theme") && mode === "system") mode = root.getAttribute("data-theme")!
apply(mode)
btn.addEventListener("click", () => {
  mode = mode === "system" ? "light" : mode === "light" ? "dark" : "system"
  apply(mode)
  try {
    localStorage.setItem("bf-theme", mode)
  } catch {}
})

// Copy buttons
document.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((b) =>
  b.addEventListener("click", () => {
    const el = document.getElementById(b.dataset.copy!)!
    const done = () => {
      b.textContent = "Copied"
      setTimeout(() => (b.textContent = "Copy"), 1400)
    }
    navigator.clipboard?.writeText(el.textContent || "").then(done, () => {
      const range = document.createRange()
      range.selectNodeContents(el)
      const sel = getSelection()!
      sel.removeAllRanges()
      sel.addRange(range)
    })
  })
)

initPlayground()
initOrbit()
