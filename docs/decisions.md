# Noxus — Technical Decisions

Este documento registra decisiones técnicas detectadas en el código.
Cuando la razón no es explícita en el código, se marca como **[Inferido]**.

---

## 1. Node.js como runtime

**Decisión**: Usar Node.js para un emulador de MMORPG.

**[Inferido]** Razones probables:
- JavaScript es accesible y el equipo tenía experiencia en él
- El ecosistema npm ofrece librerías para sockets TCP, MongoDB y manipulación
  binaria sin depender de lenguajes compilados
- Permite iteración rápida. En la migración actual se ejecuta directamente con
  `node src/app.js` y opcionalmente `node --watch src/app.js`.

**Trade-off**: Node.js es monohilo. Las operaciones bloqueantes (cálculo de
paths, procesamiento de combate) se ejecutan en el event loop. No se usa
 clustering ni workers.

---

## 2. Node 25 sin Babel

**Decisión actual**: Ejecutar `src/app.js` directamente con Node 25 y CommonJS,
sin Babel ni carpeta `dist/`.

**Contexto histórico**: En 2016 el proyecto usaba Babel 6 con preset es2015
porque el soporte de ES6 en Node era parcial. La migración de 2026 eliminó ese
paso de build.

**Razones**:
- Node 25 soporta las features necesarias sin transpilación.
- Menos artefactos generados (`dist/`) y menos tooling legacy.
- El flujo de desarrollo y despliegue se simplifica a `pnpm install` +
  `node src/app.js`.

**Trade-off**: La conversión a CommonJS nativo expone ciclos que Babel toleraba.
Se resolvieron con lazy `require`, pero el grafo de dependencias sigue siendo
frágil y debe modificarse con cuidado.

---

## 3. MongoDB como base de datos

**Decisión**: Usar MongoDB en lugar de SQL (MySQL/PostgreSQL).

**Evidencia**: `package.json` solo lista `mongodb` como driver de BD.

**[Inferido]** Razones probables:
- Los datos de Dofus (items, hechizos) son documentos JSON naturales
- MongoDB permite iterar rápido sin esquemas rígidos
- No hay migraciones; los datos se importan desde JSON

**Trade-off**:
- Sin esquema fijo → posible inconsistencia de datos
- Sin relaciones formales (joins) → los datos relacionados se obtienen con
  múltiples queries encadenadas (callback hell)
- Las contraseñas en texto plano son un riesgo de seguridad — MongoDB no
  impide esto, depende del código de aplicación

---

## 4. Protocolo binario manual vs. JSON/Protobuf

**Decisión**: Implementar serialización binaria manual del protocolo Dofus.

**Evidencia**: `messages.js` (~5000 líneas) con serialize/deserialize manual
para cada mensaje. `custom_data_wrapper.js` implementa varint, lectura de
shorts, ints y strings.

**[Inferido]** Razones:
- El protocolo de Dofus es binario propietario — no hay alternativa
- El cliente oficial espera este formato exacto
- Se hizo ingeniería inversa del protocolo (export/protocol.js contiene los
  typeProtocolId mapeados)

**Trade-off**:
- ~5000 líneas de código repetitivo
- Frágil: un cambio en el orden de los campos rompe compatibilidad
- Difícil de debuggear (sin herramienta de inspección de paquetes)

---

## 5. Datacenter en RAM

**Decisión**: Cargar TODOS los datos de juego en RAM al iniciar.

**Evidencia**: `Datacenter.load()` carga ~19 colecciones completas desde
MongoDB a arrays estáticos. Las consultas de datos de juego se hacen por
iteración lineal (`for...in`) sobre estos arrays, sin índices.

**Trade-off**:
- Ventaja: acceso ultrarrápido sin queries a BD durante el juego
- Desventaja: consumo de RAM proporcional a la cantidad de datos
- Desventaja: búsqueda O(n) en arrays para cada lookup

---

## 6. Singleton con static properties vs. inyección de dependencias

**Decisión**: Usar clases con métodos y propiedades `static` como estado
global.

**Evidencia**: `AuthServer.clients`, `WorldServer.clients`, `Datacenter.breeds`,
`WorldManager.maps` — todos son arrays/objetos estáticos accedidos directamente.

**[Inferido]** Razones:
- Simplicidad: no requiere contenedor DI ni configuración
- En un monolito con un solo proceso, el estado global funciona
- El equipo probablemente venía de un background sin frameworks modernos

**Trade-off**:
- Difícil de testear (no se puede mockear una propiedad static fácilmente)
- Acoplamiento fuerte entre módulos
- Imposible ejecutar múltiples instancias aisladas en el mismo proceso

---

## 7. Callbacks vs. Promises/async-await

**Decisión**: Usar callbacks para todas las operaciones asíncronas.

**Evidencia**: Todo `DBManager` recibe un callback como último parámetro.
Las operaciones anidadas crean "callback hell".

**Contexto**: En 2016, async/await no estaba estandarizado. En la migración a
Node 25, `DBManager` usa Promises internamente donde lo exige `mongodb` 6.x,
pero conserva callbacks públicos para minimizar cambios en handlers/managers.

**Trade-off**:
- Legibilidad reducida en operaciones anidadas
- Manejo de errores inconsistente (el error de callback frecuentemente se ignora)

---

## 8. Auth + World en el mismo proceso

**Decisión**: Ejecutar auth server y world server en el mismo proceso Node.js.

**Evidencia**: `app.js` inicia ambos servidores secuencialmente.

**Trade-off**:
- Simplicidad operativa: un solo proceso que levantar
- Desventaja: si uno crashea, todo crashea
- Desventaja: no se pueden escalar independientemente

---

## 9. Contraseñas en texto plano

**Decisión**: Almacenar y comparar contraseñas sin hashing.

**Evidencia**: `auth_handler.js` línea 57:
```js
if(account.password != credentials.password) { ... }
```

**Contexto**: Esto era mala práctica incluso en 2016. Probablemente una
decisión de velocidad de desarrollo sobre seguridad.

**Riesgo**: Crítico. Cualquier acceso a la base de datos expone todas las
contraseñas.

---

## 10. Sin tests automatizados

**Decisión**: No implementar tests.

**Evidencia**: `package.json` script `test` es un placeholder. No hay
dependencias de testing.

**[Inferido]** Razones:
- Proyecto en fase alpha, prioridad en features sobre calidad
- Equipo pequeño, posiblemente sin experiencia en testing
- Difícil testear un servidor TCP con estado global

---

## Resumen de trade-offs

| Decisión                | Ganancia                  | Pérdida                       |
|-------------------------|---------------------------|-------------------------------|
| Monolito                | Simple de desarrollar     | Difícil de escalar/testear    |
| MongoDB sin esquema     | Iteración rápida          | Inconsistencia potencial      |
| Datos en RAM            | Velocidad                 | Consumo de memoria            |
| Callbacks               | Compatible con Node 2016  | Legibilidad, error handling   |
| Sin tests               | Velocidad de desarrollo   | Regresiones frecuentes        |
| Contraseñas plain text  | Simplicidad               | Riesgo de seguridad crítico   |
