# Mundial 2026

Pagina estatica para consultar partidos, grupos, fases, resultados y estadisticas del Mundial 2026 usando football-data.org.

## Importante sobre el token

No subas tu API token al repositorio. El sitio no tiene ningun token guardado en el codigo.

Si ya publicaste o compartiste un token, rotalo desde tu cuenta de football-data.org.

## Publicar en GitHub Pages

1. Crea un repositorio publico en GitHub.
2. Sube estos archivos de la carpeta `outputs`:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `cloudflare-worker.js` solo como referencia para el proxy
3. En GitHub, entra a `Settings > Pages`.
4. En `Build and deployment`, elegi `Deploy from a branch`.
5. Selecciona la rama principal y la carpeta `/root`.
6. Guarda los cambios.

GitHub Pages te va a dar una URL similar a:

```text
https://tu-usuario.github.io/tu-repositorio/
```

## Por que hace falta un proxy

football-data.org bloquea llamadas directas desde el navegador en muchos casos por CORS. En local se resolvio con `server.py`, pero GitHub Pages no puede ejecutar Python ni ningun backend.

Para que funcione publicado, desplega un proxy en Cloudflare Workers, Vercel, Render u otro servicio similar. Este repo incluye `cloudflare-worker.js` como proxy minimo.

## Cloudflare Worker

1. Crea un Worker en Cloudflare.
2. Pega el contenido de `cloudflare-worker.js`.
3. Configura una variable secreta llamada `FOOTBALL_DATA_TOKEN` con tu token de football-data.org.
4. Publica el Worker.
5. Copia la URL del Worker, por ejemplo:

```text
https://mundial-proxy.tu-cuenta.workers.dev/api
```

6. En la pagina publicada, pega esa URL en `Proxy opcional`.
7. El campo `API token` puede quedar vacio si configuraste `FOOTBALL_DATA_TOKEN` en el Worker.

Para mayor seguridad, edita `ALLOWED_ORIGIN` dentro del Worker con la URL exacta de tu GitHub Pages.

