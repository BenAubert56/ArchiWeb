import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        react(),
        tailwindcss()
    ],
    server: {
        host: true, // listen on 0.0.0.0 inside container
        port: 5173,
        strictPort: true,
        watch: {
            usePolling: true,
        },
        hmr: {
            clientPort: 5173,
        },
    },
    preview: {
        host: true,
        port: 5173,
        strictPort: true,
    },
})
