module.exports = {
  apps: [{
    name: 'clawyard',
    script: 'src/server.js',
    env: {
      PORT: 3100,
      NODE_ENV: 'production'
    },
    watch: false,
    max_memory_restart: '200M'
  }]
};
