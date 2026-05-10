# Banco de tests

App estatica para practicar preguntas tipo test desde un banco JSON. Funciona en local y en GitHub Pages porque no necesita servidor ni base de datos externa.

## Uso

Abre `index.html` en el navegador. Tambien puedes servir la carpeta con cualquier servidor estatico.

El banco principal esta en `data/question-bank.json`. La app permite cargar mas `.xlsx` o `.json` desde el boton de carga. Las preguntas anadidas se guardan en el navegador con `localStorage`, asi que permanecen al recargar en ese dispositivo.

La seleccion de temas permite marcar varios temas a la vez para mezclar preguntas. El buscador solo filtra la lista visible, no cambia la seleccion de los temas ocultos. El boton de edicion de cada tema permite cambiar su titulo en ese navegador.

La dificultad funciona como mezcla ponderada:

- `Facil`: prioriza faciles, pero incluye algunas medias y dificiles.
- `Media`: prioriza medias.
- `Dificil`: prioriza dificiles, pero rellena con medias/faciles si no hay suficientes.
- `Mixta`: reparte de forma equilibrada.

La duracion permite test rapido, normal o una cantidad personalizada.

Funcion oculta de borrado: haz 7 clics rapidos sobre el titulo `Banco de tests` y escribe la contrasena `valencia`. Esto vacia el banco en ese navegador y borra preguntas importadas, falladas guardadas y renombres de temas.

## Banco actual

El banco compartido esta en `data/question-bank.json`. Este archivo es el que vera cualquier persona al abrir la app desde GitHub Pages.

La carga de `.xlsx` desde la app sirve para anadir preguntas en ese navegador, pero no modifica el repositorio ni lo que vera otra persona en otro dispositivo. Para publicar nuevos temas para todo el mundo, hay que regenerar `data/question-bank.json` con `scripts/import_excel_bank.py` y subir el cambio a GitHub.

## Esquema de pregunta

```json
{
  "id": "fis-001",
  "topicId": "tema-1",
  "difficulty": "medium",
  "prompt": "Pregunta",
  "options": ["A", "B", "C", "D"],
  "correctIndex": 1,
  "explanation": "Por que la respuesta correcta lo es",
  "source": "Archivo.xlsx, fila 2"
}
```

## Excel esperado

La hoja recomendada se llama `preguntas` y debe tener estas columnas:

`asignatura`, `tema`, `pregunta`, `respuesta_a`, `respuesta_b`, `respuesta_c`, `respuesta_d`, `respuesta_correcta`, `texto_respuesta_correcta`, `explicacion_respuesta_correcta`, `dificultad`.

La respuesta correcta debe ser `A`, `B`, `C` o `D`. La dificultad debe ser `Facil`, `Media` o `Dificil`. La columna `explicacion_respuesta_correcta` se muestra al responder; si falta, la app usa `texto_respuesta_correcta` como respaldo. La columna clave para mezclar bien es `tema`, porque asi puede clasificar correctamente sin depender del nombre del archivo.

Para muchos temas y asignaturas, el formato mas estable es una sola hoja `preguntas`, una fila por pregunta, y que `asignatura`, `tema` y `dificultad` esten siempre rellenados.
