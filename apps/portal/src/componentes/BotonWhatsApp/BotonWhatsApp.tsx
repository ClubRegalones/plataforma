import './BotonWhatsApp.css'

function IconoWhatsApp() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path
        d="M16 3.1A12.7 12.7 0 0 0 5.2 22.5L3.4 29l6.7-1.75A12.7 12.7 0 1 0 16 3.1Zm0 23.1c-2 0-3.9-.55-5.55-1.5l-.4-.25-3.95 1.05 1.05-3.85-.25-.4A10.35 10.35 0 1 1 16 26.2Zm5.7-7.75c-.3-.15-1.8-.9-2.1-1-.28-.1-.5-.15-.7.15-.2.32-.8 1-1 1.2-.18.2-.35.22-.67.07-.3-.15-1.35-.5-2.55-1.58-.95-.85-1.6-1.9-1.78-2.2-.18-.3-.02-.47.13-.63.13-.13.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.38-.03-.53-.07-.15-.7-1.7-.95-2.32-.25-.6-.52-.52-.7-.53h-.6c-.2 0-.52.08-.8.38-.28.3-1.08 1.05-1.08 2.57s1.1 2.98 1.25 3.18c.15.2 2.15 3.3 5.23 4.62.73.32 1.3.5 1.75.65.73.23 1.4.2 1.92.13.58-.08 1.8-.73 2.05-1.43.25-.7.25-1.3.18-1.43-.08-.12-.28-.2-.58-.35Z"
        fill="currentColor"
      />
    </svg>
  )
}

function BotonWhatsApp() {
  return (
    <a
      className="boton-whatsapp"
      href="#contacto"
      aria-label="Consultar por WhatsApp"
      title="Consultar por WhatsApp"
    >
      <span className="boton-whatsapp__icono">
        <IconoWhatsApp />
      </span>
      <span className="boton-whatsapp__texto">¿Dudas?</span>
    </a>
  )
}

export default BotonWhatsApp
