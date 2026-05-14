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
- Permite iteración rápida (sin compilación, hot reload con babel --watch)

**Trade-off**: Node.js es monohilo. Las operaciones bloqueantes (cálculo de
paths, procesamiento de combate) se ejecutan en el event loop. No se usa
 clustering ni workers.

---

## 2. Babel para transpilación ES6 → ES5

**Decisión**: Usar Babel 6 con preset es2015 en lugar de escribir ES5 nativo.

**[Inferido]** Razones probables:
- En 2016, el soporte de ES6 en Node.js era parcial
- Babel permitía usar imports, clases y arrow functions con compatibilidad
- `compilation.sh` genera la carpeta `dist/` para producción

**Trade-off**: Agrega un paso de build. La carpeta `dist/` está en `.gitignore`,
lo cual es correcto.

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

**Contexto**: En 2016, async/await no estaba estandarizado. La dependencia
`babel-plugin-transform-async-to-generator` está en package.json pero no se
usa en el código (solo hay un uso comentado de `async` en `world_manager.js`).

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
