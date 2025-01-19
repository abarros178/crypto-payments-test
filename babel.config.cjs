module.exports = {
  presets: [
    [
      "@babel/preset-env",
      {
        targets: {
          node: "current", // Asegura compatibilidad con la versión de Node.js actual
        },
      },
    ],
  ],
};
