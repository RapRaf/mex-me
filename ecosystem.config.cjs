module.exports = {
    apps: [{
        name: "MexMe",
        script: "./dist/server.js",
        merge_logs: true,
        max_restarts: 20,
        instances: 1,
        max_memory_restart: "200M",
        out_file: "./logs/out.log",
        error_file: "./logs/error.log",

        env: {
            NODE_ENV: "development",
        },
        env_production: {
            NODE_ENV: "production",
        }
    }]
}
