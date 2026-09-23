function App() {
  return (
    <main className="app-base app-base--vecino">
      <section className="app-base__tarjeta">
        <span className="app-base__etiqueta">Club Regalones</span>
        <h1>App Vecino</h1>
        <p>
          Esta será la experiencia rápida para comprar, canjear, mostrar tu QR
          y, próximamente, descubrir lo que está pasando en tus negocios Regalones.
        </p>
        <div className="app-base__acciones" aria-label="Próximos módulos">
          <span>Comprar</span>
          <span>Canjear</span>
          <span>Mi QR</span>
          <span>Tu barrio hoy</span>
        </div>
      </section>
    </main>
  )
}

export default App
