// Consulta local de la biblioteca de Gracian: texto exacto por numero y busqueda por palabras.
// Todo es local: no usa red ni modelo. Uso:
//   bun gracian-cli.mjs aforismo 12 [13 14 ...]    texto exacto del aforismo (1 a 300)
//   bun gracian-cli.mjs buscar palabras del tema   hasta 3 candidatos por coincidencia de palabras
import { aforismo, buscar, formatear, AVISO_FUENTE } from "./biblioteca.mjs"

const [, , comando, ...resto] = process.argv
const uso =
  "Uso:\n  bun gracian-cli.mjs aforismo N [N ...]   (numeros del 1 al 300)\n  bun gracian-cli.mjs buscar palabras del tema"
const salir = (msg, codigo = 1) => {
  console.error(msg)
  process.exit(codigo)
}

if (comando === "aforismo") {
  const ns = resto.map((x) => Number(x))
  if (!ns.length || ns.some((n) => !Number.isInteger(n) || n < 1 || n > 300)) salir(uso)
  if (ns.length > 5) salir("De a pocos: pide hasta 5 aforismos por vez.")
  for (const n of ns) {
    console.log(formatear(aforismo(n)))
    console.log("")
  }
  console.log(AVISO_FUENTE)
} else if (comando === "buscar") {
  const consulta = resto.join(" ").trim()
  if (!consulta) salir(uso)
  const hallados = buscar(consulta)
  if (!hallados.length) {
    console.log("Sin coincidencias claras. Prueba con otras palabras, o pide un numero concreto: aforismo N.")
    process.exit(0)
  }
  console.log("Candidatos por coincidencia de palabras; puede que ninguno venga al caso, usa solo los pertinentes.\n")
  for (const a of hallados) {
    console.log(formatear(a))
    console.log("")
  }
  console.log(AVISO_FUENTE)
} else {
  salir(uso)
}
