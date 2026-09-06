function App() {
  return (
    <main className="app-base app-base--negocio">
      <section className="app-base__tarjeta">
        <span className="app-base__etiqueta">Club Regalones</span>
        <h1>App Negocio</h1>
        <p>
          Esta será la herramienta rápida del cajero para recibir compras,
          aprobar montos, gestionar canjes y trabajar incluso cuando la conexión falle.
        </p>
        <div className="app-base__acciones" aria-label="Próximos módulos">
          <span>Cajero + PIN</span>
          <span>Compras</span>
          <span>Canjes</span>
          <span>Modo offline</span>
        </div>
      </section>
    </main>
  )
}

export default App
