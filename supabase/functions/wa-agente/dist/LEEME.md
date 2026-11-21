# Despliegue de wa-agente (sin depender de GitHub)

`dist/index.js` es el paquete que se sube a Supabase: todos los módulos de `wa-agente` en un archivo, con los
paquetes `npm:` como externos. Se regenera con:

    cd supabase/functions/wa-agente
    npx -y esbuild@0.24.0 index.ts --bundle --format=esm --platform=neutral --target=es2022 \
      --minify-syntax --external:'npm:*' --charset=utf8 --legal-comments=none --outfile=dist/index.js

y se publica como Edge Function `wa-agente` con `dist/index.js` como único archivo (entrypoint `index.js`, sin
verificación JWT: la función valida `x-agente-secret`). El simulador vive en la misma función: `POST …/wa-agente/simular`.
El prompt de producción está en `wa.config.agente_prompt`; para probar uno nuevo se guarda en `agente_prompt_prueba`
y se simula con `"prompt_clave": "agente_prompt_prueba"`.
