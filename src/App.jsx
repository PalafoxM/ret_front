import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { divIcon } from 'leaflet'
import Swal from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'leaflet/dist/leaflet.css'
import privacyNotice from './assets/aviso_de_privacidad_integral_ret.pdf'
import logoRet from './assets/logo_ret_altb.png'
import logogto from './assets/ggt-2006.png'
import './App.css'
import './Wizard.css'
import './GeneralForm.css'
import './TechnicalForm.css'
import './LegalForm.css'
import './GraphicForm.css'
import './LodgingForm.css'
import './ExperienceForm.css'
import './Records.css'
import './Theme.css'
import './Logo.css'
import './Admin.css'

const DEFAULT_CENTER = [23.6345, -102.5528]
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const STATUS_MESSAGES = {
  400: 'Revisa la información enviada.',
  401: 'Tu sesión ya no es válida. Inicia sesión nuevamente.',
  403: 'No tienes permisos para realizar esta acción.',
  404: 'No se encontró la información solicitada.',
  409: 'La operación no pudo completarse porque existe un conflicto.',
  413: 'El archivo es demasiado grande.',
  422: 'Revisa los campos obligatorios.',
  429: 'Demasiadas solicitudes. Intenta más tarde.',
}

function readCookie(name) {
  const item = document.cookie.split('; ').find((entry) => entry.startsWith(`${name}=`))
  return item ? decodeURIComponent(item.slice(name.length + 1)) : ''
}

function readCsrfToken() {
  const metaToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content')
  return metaToken || readCookie('ret_csrf')
}

let csrfRequest = null

async function ensureCsrfToken() {
  const existingToken = readCsrfToken()
  if (existingToken) return existingToken
  if (!csrfRequest) {
    csrfRequest = window.fetch('/api/auth/csrf', { credentials: 'same-origin', cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => null)
        if (!response.ok) throw Object.assign(new Error('No fue posible iniciar la validación de seguridad.'), { status: response.status })
        return payload?.data?.csrfToken || readCsrfToken()
      })
      .finally(() => { csrfRequest = null })
  }
  const token = await csrfRequest
  if (!token) throw new Error('No fue posible obtener la validación de seguridad.')
  return token
}

async function apiFetch(input, init = {}) {
  const method = String(init.method || 'GET').toUpperCase()
  const headers = new Headers(init.headers || {})
  if (!SAFE_METHODS.has(method)) {
    const csrfToken = await ensureCsrfToken()
    headers.set('X-CSRF-Token', csrfToken)
  }
  const response = await window.fetch(input, { ...init, credentials: 'same-origin', headers })
  if (!response.ok) {
    const payload = await response.clone().json().catch(() => null)
    const serverMessage = typeof payload?.message === 'string' ? payload.message.trim() : ''
    throw Object.assign(new Error(serverMessage || `HTTP ${response.status}`), {
      status: response.status,
      serverMessage,
    })
  }
  return response
}

function safeErrorMessage(error, fallback) {
  if (error?.name === 'AbortError') return fallback
  if (error?.serverMessage) return error.serverMessage
  return STATUS_MESSAGES[Number(error?.status)] || fallback
}

const cleanCatalogText = (value) => {
  if (typeof value !== 'string') return value
  const entities = {
    amp: '&', aacute: '\u00e1', eacute: '\u00e9', iacute: '\u00ed', oacute: '\u00f3', uacute: '\u00fa',
    Aacute: '\u00c1', Eacute: '\u00c9', Iacute: '\u00cd', Oacute: '\u00d3', Uacute: '\u00da',
    ntilde: '\u00f1', Ntilde: '\u00d1', uuml: '\u00fc', Uuml: '\u00dc',
  }
  const mojibake = {
    '\u00c3\u00a1': '\u00e1', '\u00c3\u00a9': '\u00e9', '\u00c3\u00ad': '\u00ed', '\u00c3\u00b3': '\u00f3', '\u00c3\u00ba': '\u00fa',
    '\u00c3\u0081': '\u00c1', '\u00c3\u0089': '\u00c9', '\u00c3\u008d': '\u00cd', '\u00c3\u0093': '\u00d3', '\u00c3\u009a': '\u00da',
    '\u00c3\u00b1': '\u00f1', '\u00c3\u0091': '\u00d1', '\u00c3\u00bc': '\u00fc', '\u00c3\u009c': '\u00dc',
  }
  return value
    .replace(/&iacutestica/gi, '\u00edstica')
    .replace(/&([A-Za-z]+);/g, (match, entity) => entities[entity] ?? match)
    .replace(/[\u00c3][\u0080-\u00bf]/g, (match) => mojibake[match] ?? match)
    .trim()
}
const GIRO_ICONS = {
  1: '🏨', 2: '✈️', 3: '🧭', 4: '🎪', 5: '🍽️',
  6: '⛳', 7: '🏺', 8: '🏛️', 9: '🚗', 10: '🎡',
  11: '🗺️', 12: '🌊', 13: '🎓', 14: '🏃', 15: '🧖',
  16: '🎙️', 17: '🏠', 18: '🌾', 19: '🔄',
}

const LOCATION_ICONS = Object.fromEntries(
  Object.entries(GIRO_ICONS).map(([id, symbol]) => [id, divIcon({
    className: `location-marker giro-${id}`,
    html: `<span aria-hidden="true"><b>${symbol}</b></span>`,
    iconSize: [36, 44],
    iconAnchor: [18, 44],
    popupAnchor: [0, -40],
  })]),
)

function FitMap({ locations }) {
  const map = useMap()
  useEffect(() => {
    if (!locations.length) return
    if (locations.length === 1) map.setView([locations[0].latitud, locations[0].longitud], 14)
    else map.fitBounds(locations.map(({ latitud, longitud }) => [latitud, longitud]), { padding: [60, 60], maxZoom: 15 })
  }, [locations, map])
  return null
}

function RegistrationModal({ onClose, accountEmail = '', onRegistered }) {
  const usesExistingAccount = Boolean(accountEmail)
  const [giros, setGiros] = useState([])
  const [municipios, setMunicipios] = useState([])
  const [email, setEmail] = useState(accountEmail)
  const [emailConfirmation, setEmailConfirmation] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [registrationResult, setRegistrationResult] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      apiFetch('/api/giros', { signal: controller.signal }).then((response) => response.json()),
      apiFetch('/api/municipios', { signal: controller.signal }).then((response) => response.json()),
    ]).then(([girosResponse, municipiosResponse]) => {
      setGiros(Array.isArray(girosResponse.data) ? girosResponse.data : [])
      setMunicipios(Array.isArray(municipiosResponse.data) ? municipiosResponse.data : [])
    }).catch((error) => {
      if (error.name !== 'AbortError') Swal.fire({ icon: 'error', title: 'No fue posible cargar el formulario', text: 'No se pudieron obtener los giros y municipios. Intenta nuevamente.', confirmButtonColor: '#0878b9' })
    })

    const closeWithEscape = (event) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', closeWithEscape)
    document.body.style.overflow = 'hidden'
    return () => {
      controller.abort()
      document.removeEventListener('keydown', closeWithEscape)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const submitRegistration = async (event) => {
    event.preventDefault()
    if (!usesExistingAccount && email.trim().toLocaleLowerCase() !== emailConfirmation.trim().toLocaleLowerCase()) {
      await Swal.fire({ icon: 'warning', title: 'Los correos no coinciden', text: 'Verifica que ambos correos electrónicos sean iguales.', confirmButtonColor: '#0878b9' })
      return
    }
    setIsSubmitting(true)
    const formData = new FormData(event.currentTarget)
    const payload = Object.fromEntries(formData.entries())
    payload.privacidad = formData.has('privacidad')

    try {
      const response = await apiFetch('/api/registro', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-CSRF-Token': readCsrfToken(),
        },
        body: JSON.stringify(payload),
      })
      const result = await response.json()
      if (!response.ok) throw new Error()
      if (result.data?.existingAccount && onRegistered) {
        await onRegistered(result.data)
        return
      }
      setRegistrationResult(result.data)
    } catch (error) {
      await Swal.fire({
        icon: 'error',
        title: 'No fue posible completar el registro',
          text: safeErrorMessage(error, 'Ocurrió un error inesperado. Intenta nuevamente.'),
        confirmButtonText: 'Entendido',
        confirmButtonColor: '#0878b9',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return createPortal(<div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="registration-modal" role="dialog" aria-modal="true" aria-labelledby="registration-title">
      <button className="modal-close" type="button" onClick={onClose} aria-label="Cerrar registro">×</button>
      <header className="registration-header">
        <div><span className="step-pill">Paso 1</span><h2 id="registration-title">Inscripción al RET</h2><p>Formulario inicial para registrar tu establecimiento en el sistema.</p></div>
        <div className="registration-badge"><span>Nuevo registro</span><strong>Establecimiento turístico</strong></div>
      </header>
      {registrationResult ? <div className="registration-success">
        <span className="success-icon" aria-hidden="true">✓</span>
        <h3>Registro creado correctamente</h3>
        <p>{registrationResult.existingAccount
          ? 'El establecimiento quedó asociado a tu cuenta y ya aparece en Mis registros. No se generaron nuevas credenciales.'
          : registrationResult.emailSent
          ? 'Enviamos las instrucciones de acceso al correo indicado. Si no las encuentras, usa la opción «Olvidé mi contraseña».'
          : 'No fue posible enviar el correo. Usa la opción «Olvidé mi contraseña» para solicitar nuevamente las instrucciones de acceso.'}</p>
        <dl><div><dt>Clave RET del establecimiento</dt><dd>{registrationResult.clave}</dd></div></dl>
        <button className="registration-submit" type="button" onClick={() => onRegistered ? onRegistered(registrationResult) : onClose()}>Finalizar</button>
      </div> : <form className="registration-form" onSubmit={submitRegistration}>
        <label className="registration-field registration-wide">Registro Federal de Contribuyentes (RFC)<input name="rfc" placeholder="Ej. ABCD010203EF4" minLength="12" maxLength="13" required /></label>
        <label className="registration-field">Giro comercial<select name="giro" defaultValue="" required><option value="" disabled>Elegir giro…</option>{giros.map((item) => <option key={item.id_giro} value={item.id_giro}>{GIRO_ICONS[item.id_giro] || '📍'} {cleanCatalogText(item.giro)}</option>)}</select></label>
        <label className="registration-field">Municipio<select name="municipio" defaultValue="" required><option value="" disabled>Elegir municipio…</option>{municipios.map((item) => <option key={item.id_municipio} value={item.id_municipio}>{item.municipio}</option>)}</select></label>
        <label className="registration-field registration-wide">Nombre completo o nombre comercial<input name="nombre_completo" maxLength="200" required /></label>
        <label className="registration-field">Fecha de inicio de operación y/o apertura<input name="fecha_inicio" type="date" required /></label>
        <span className="registration-spacer" aria-hidden="true" />
        {usesExistingAccount ? <label className="registration-field registration-wide">Correo de la cuenta<input name="email" type="email" value={email} readOnly /></label> : <><label className="registration-field">Correo electrónico<input name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nombre@ejemplo.com" autoComplete="email" required /></label><label className="registration-field">Confirmar correo electrónico<input name="email_confirmation" type="email" value={emailConfirmation} onChange={(event) => setEmailConfirmation(event.target.value)} placeholder="Repite tu correo" autoComplete="email" required /></label></>}
        <label className="privacy-check registration-wide"><input name="privacidad" value="1" type="checkbox" required /><span>Acepto y estoy de acuerdo con lo manifestado en el <a href={privacyNotice} target="_blank" rel="noreferrer">Aviso de Privacidad Integral RET</a>.</span></label>
        <button className="registration-submit registration-wide" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Creando registro…' : 'Registrarme'} {!isSubmitting && <span aria-hidden="true">→</span>}</button>
      </form>}
    </section>
  </div>, document.body)
}

function LoginPanel({ onLogin, onAdminLogin }) {
  const [message, setMessage] = useState('')
  const [showRegistration, setShowRegistration] = useState(false)
  const closeRegistration = useCallback(() => setShowRegistration(false), [])
  const recoverPassword = async () => {
    const result = await Swal.fire({
      title: 'Recuperar contraseña',
      text: 'Ingresa el correo electrónico con el que registraste tu establecimiento.',
      input: 'email',
      inputLabel: 'Correo registrado',
      inputPlaceholder: 'nombre@ejemplo.com',
      confirmButtonText: 'Enviar credenciales',
      cancelButtonText: 'Cancelar',
      showCancelButton: true,
      showLoaderOnConfirm: true,
      confirmButtonColor: '#0878b9',
      cancelButtonColor: '#617887',
      allowOutsideClick: () => !Swal.isLoading(),
      inputValidator: (value) => {
        const email = String(value || '').trim()
        if (!email) return 'El correo electrónico es obligatorio'
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return 'Ingresa un correo electrónico válido'
        return undefined
      },
      preConfirm: async (value) => {
        try {
          const response = await apiFetch('/api/auth/recuperar-password', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'X-CSRF-Token': readCsrfToken() },
            body: JSON.stringify({ email: String(value).trim().toLowerCase() }),
          })
          const payload = await response.json()
          if (!response.ok) throw new Error()
          return payload
        } catch (error) {
          Swal.showValidationMessage(safeErrorMessage(error, 'No fue posible conectar con el servidor'))
          return false
        }
      },
    })
    if (result.isConfirmed) {
      await Swal.fire({
        icon: 'success',
        title: 'Solicitud recibida',
        text: 'Si el correo está registrado, recibirás instrucciones para continuar.',
        confirmButtonColor: '#0878b9',
      })
    }
  }
  const submit = async (event) => {
    event.preventDefault()
    setMessage('')
    const formData = new FormData(event.currentTarget)
    try {
      const response = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-CSRF-Token': readCsrfToken() },
        body: JSON.stringify({
          clave: formData.get('clave'),
          password: formData.get('password'),
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error()
      onLogin(result.data)
    } catch (error) {
      setMessage(safeErrorMessage(error, 'No fue posible iniciar sesión.'))
    }
  }

  const adminLogin = async () => {
    const result = await Swal.fire({
      title: 'Acceso administrativo',
      html: '<input id="admin-email" class="swal2-input" type="email" autocomplete="username" placeholder="Correo electrónico"><input id="admin-password" class="swal2-input" type="password" autocomplete="current-password" placeholder="Contraseña">',
      showCancelButton: true,
      showLoaderOnConfirm: true,
      confirmButtonText: 'Ingresar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#0878b9',
      allowOutsideClick: () => !Swal.isLoading(),
      preConfirm: async () => {
        const email = Swal.getPopup()?.querySelector('#admin-email')?.value.trim().toLowerCase() || ''
        const password = Swal.getPopup()?.querySelector('#admin-password')?.value || ''
        if (!email || !password) { Swal.showValidationMessage('Captura correo y contraseña'); return false }
        try {
          const response = await apiFetch('/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })
          return (await response.json()).data
        } catch (error) {
          Swal.showValidationMessage(safeErrorMessage(error, 'No fue posible iniciar la sesión administrativa.'))
          return false
        }
      },
    })
    if (result.isConfirmed && result.value) onAdminLogin(result.value)
  }

  return <aside className="login-panel">
    <div className="brand">
      <img className="brand-logo brand-logo-ret" src={logoRet} alt="RET" />
      <img className="brand-logo brand-logo-gto" src={logogto} alt="Guanajuato" />
    </div>
    <div className="login-content">
      <span className="eyebrow">Portal de acceso</span>
      <h1>Registro Estatal de Turismo de Guanajuato</h1>
      <p className="intro">Ingresa tus credenciales</p>
      <form onSubmit={submit}>
        <label htmlFor="clave">Clave RET</label>
        <div className="field"><span aria-hidden="true">🔑</span><input id="clave" name="clave" type="text" placeholder="RET01010023" autoComplete="username" minLength="9" maxLength="17" required /></div>
        <div className="password-row"><label htmlFor="password">Contraseña</label><button className="text-button" type="button" onClick={recoverPassword}>Olvidé mi contraseña</button></div>
        <div className="field"><span aria-hidden="true">◇</span><input id="password" name="password" type="password" placeholder="Tu contraseña" autoComplete="current-password" required /></div>
        <button className="primary-button" type="submit">Iniciar sesión <span aria-hidden="true">→</span></button>
        <button className="secondary-button" type="button" onClick={() => setShowRegistration(true)}>Registrarse <span aria-hidden="true">+</span></button>
        <button className="admin-access-button" type="button" onClick={adminLogin}>Acceso administrativo</button>
        {message && <p className="form-message" role="status">{message}</p>}
      </form>
    </div>
    <p className="support">¿Necesitas ayuda? <a href="mailto:soporte@ret.mx">Contacta a soporte</a></p>
    {showRegistration && <RegistrationModal onClose={closeRegistration} />}
  </aside>
}

function FormSection({ icon, title, children }) {
  return <section className="general-section"><header><span>{icon}</span><div><strong>{title}</strong><small>Los campos marcados con * son obligatorios.</small></div></header>{children}</section>
}

function MapClickHandler({ onChange }) {
  useMapEvents({ click: (event) => onChange(event.latlng) })
  return null
}

function DatosGeneralesStep({ user, onContinue }) {
  const [data, setData] = useState(null)
  const [subrubros, setSubrubros] = useState([])
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    apiFetch('/api/form/datos-generales', { signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(); return result })
      .then((result) => { setData(result.data); setSubrubros(result.subrubros || []) })
      .catch((error) => { if (error.name !== 'AbortError') setMessage(safeErrorMessage(error, 'No fue posible cargar el formulario.')) })
    return () => controller.abort()
  }, [])

  const update = (name, value) => setData((current) => ({ ...current, [name]: value }))
  const position = data && Number(data.latitud) >= 14 && Number(data.latitud) <= 33
    ? [Number(data.latitud), Number(data.longitud) > 0 ? -Number(data.longitud) : Number(data.longitud)]
    : [21.019, -101.257]

  const save = async (form) => {
    if (form && !form.reportValidity()) return
    setSaving(true)
    setMessage('')
    try {
      const response = await apiFetch('/api/form/datos-generales', { method: 'PUT', headers: { 'content-type': 'application/json', 'X-CSRF-Token': readCsrfToken() }, body: JSON.stringify(data) })
      await response.json()
      if (!response.ok) throw new Error()
      setMessage('Datos generales guardados correctamente.')
      onContinue()
    } catch (error) {
      setMessage(safeErrorMessage(error, 'No fue posible guardar los datos.'))
    } finally {
      setSaving(false)
    }
  }

  if (!data) return <div className="form-loading">{message || 'Cargando datos generales…'}</div>
  const field = (name) => ({ value: data[name] ?? '', onChange: (event) => update(name, event.target.value) })
  const certification = (name, label) => <label className="cert-option"><input type="checkbox" checked={Boolean(Number(data[name]))} onChange={(event) => update(name, event.target.checked ? 1 : 0)} />{label}</label>

  return <div className="general-form">
    <FormSection icon="ⓘ" title="Datos Generales"><div className="general-grid"><label className="wide">Nombre comercial<input value={data.nombre_comercial || ''} readOnly /></label><label className="wide">Persona responsable *<input {...field('contacto')} placeholder="Persona de contacto" required /></label></div></FormSection>
    <FormSection icon="🏛️" title="Datos Legales"><div className="general-grid"><label>Tipo de persona *<select {...field('tipo_persona')} required><option value="">Seleccionar…</option><option value="1">Persona física</option><option value="2">Persona moral</option></select></label><label>RFC<input value={data.info_rfc || ''} readOnly /></label><label>Razón social *<input {...field('razon_social')} required /></label><label>Representante legal<input {...field('representante_moral')} /></label></div></FormSection>
    {subrubros.length > 0 && <FormSection icon="🏢" title="Sub-Rubro"><div className="general-grid"><label className="wide">Subrubro al que pertenece *<select {...field('idgiro_subrubro')} required><option value="">Elegir opción…</option>{subrubros.map((item) => <option key={item.idgiro_subrubro} value={item.idgiro_subrubro}>{cleanCatalogText(item.descripcion)}</option>)}</select></label></div></FormSection>}
    <FormSection icon="📍" title="Dirección"><div className="general-grid"><label className="wide">Calle *<input {...field('calle')} required /></label><label>Número exterior *<input {...field('numero')} required /></label><label>Número interior<input {...field('interior')} /></label><label>Colonia *<input {...field('colonia')} required /></label><label>Municipio<input value={data.municipio_nombre || ''} readOnly /></label><label>Código postal *<input {...field('cp')} inputMode="numeric" required /></label></div></FormSection>
    <FormSection icon="📞" title="Teléfonos"><div className="general-grid"><label>Teléfono *<input {...field('telefono')} type="tel" required /></label><label>Teléfono de atención al cliente *<input {...field('telefono_comercial')} type="tel" required /></label><label>Teléfono alternativo<input {...field('telefono2')} type="tel" /></label></div></FormSection>
    <FormSection icon="📶" title="Datos Electrónicos"><div className="general-grid"><label>Sitio web<input {...field('web')} placeholder="https://" /></label><label>Correo electrónico<input value={data.correo || user.email || ''} readOnly /></label><label>Correo de atención al cliente *<input {...field('correo_atncli')} type="email" required /></label><label>Facebook Fan Page<input {...field('facebook')} placeholder="https://" /></label><label>Twitter / X<input {...field('twitter')} placeholder="https://" /></label></div></FormSection>
    <FormSection icon="🏅" title="Certificaciones"><div className="cert-grid">{certification('h', 'Distintivo H')}{certification('m', 'Distintivo M')}{certification('tesoros', 'Tesoros de Guanajuato')}{certification('iso', 'ISO')}{certification('punto_limpio', 'Punto Limpio')}{certification('anfitrion', 'Gran Anfitrión')}{certification('estandares', 'Estándares de Competencia Laboral')}{certification('otro', 'Otra')}<label>Otra, ¿cuál?<input {...field('otrocertificacion')} /></label></div></FormSection>
    <FormSection icon="✎" title="Descripción"><label className="description-field">Descripción promocional *<textarea {...field('descripcion')} rows="5" required /></label></FormSection>
    <FormSection icon="🌎" title="Georreferenciación"><p className="map-help">Arrastra el pin o selecciona una ubicación en el mapa.</p><div className="form-map"><MapContainer center={position} zoom={12}><TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><MapClickHandler onChange={(latlng) => { update('latitud', latlng.lat); update('longitud', latlng.lng) }} /><Marker position={position} draggable icon={LOCATION_ICONS[user.giro] || LOCATION_ICONS[1]} eventHandlers={{ dragend: (event) => { const point = event.target.getLatLng(); update('latitud', point.lat); update('longitud', point.lng) } }} /></MapContainer></div><div className="coordinate-row"><span>Latitud: {Number(position[0]).toFixed(6)}</span><span>Longitud: {Number(position[1]).toFixed(6)}</span></div></FormSection>
    <section className="legal-declarations">
      <label><input type="checkbox" checked={Boolean(Number(data.protesto_juridico))} onChange={(event) => update('protesto_juridico', event.target.checked ? 1 : 0)} required /><span>Declaro bajo protesta de decir verdad que la información y documentación brindada para el presente registro es verídica. <b>*</b></span></label>
      <label><input type="checkbox" checked={Boolean(Number(data.aviso_descripcion))} onChange={(event) => update('aviso_descripcion', event.target.checked ? 1 : 0)} required /><span>Acepto que mi descripción sea modificada para fines de promoción turística en el portal guanajuato.mx por parte del área comercial de la Secretaría de Turismo del Estado de Guanajuato. <b>*</b></span></label>
    </section>
    {message && <p className="general-message" role="status">{message}</p>}
    <button className="save-general" type="button" disabled={saving} onClick={(event) => save(event.currentTarget.form)}>{saving ? 'Guardando…' : 'Guardar y continuar'} <span>→</span></button>
  </div>
}

function DatosTecnicosStep({ onContinue, onBack }) {
  const [data, setData] = useState(null)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    apiFetch('/api/form/datos-tecnicos', { signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(); return result })
      .then((result) => {
        const normalized = { ...result.data }
        for (const name of ['inst_disca', 'lgbttit', 'pet_friendly']) {
          if (String(normalized[name]).toUpperCase() === 'SI') normalized[name] = '1'
          else if (String(normalized[name]).toUpperCase() === 'NO') normalized[name] = '0'
        }
        setData(normalized)
      })
      .catch((error) => { if (error.name !== 'AbortError') setMessage(safeErrorMessage(error, 'No fue posible cargar los datos técnicos.')) })
    return () => controller.abort()
  }, [])

  const update = (name, value) => setData((current) => ({ ...current, [name]: value }))
  const save = async (form) => {
    if (form && !form.reportValidity()) return
    if (![data.local, data.regional, data.nacional, data.internacional].some((value) => Boolean(Number(value)))) {
      setMessage('Selecciona al menos un tipo de mercado.')
      return
    }
    setSaving(true)
    setMessage('')
    try {
      const response = await apiFetch('/api/form/datos-tecnicos', { method: 'PUT', headers: { 'content-type': 'application/json', 'X-CSRF-Token': readCsrfToken() }, body: JSON.stringify(data) })
      await response.json()
      if (!response.ok) throw new Error()
      setMessage('Datos técnicos guardados correctamente.')
      onContinue()
    } catch (error) {
      setMessage(safeErrorMessage(error, 'No fue posible guardar los datos técnicos.'))
    } finally {
      setSaving(false)
    }
  }

  if (!data) return <div className="form-loading">{message || 'Cargando datos técnicos…'}</div>
  const field = (name) => ({ value: data[name] ?? '', onChange: (event) => update(name, event.target.value) })
  const numberField = (name, label) => <label>{label} *<input {...field(name)} type="number" min="0" max="9999" placeholder="0" required /></label>
  const yesNo = (name, label) => <label>{label} *<select {...field(name)} required><option value="">Elegir opción…</option><option value="1">Sí</option><option value="0">No</option></select></label>
  const market = (name, label) => <label className="market-option"><input type="checkbox" checked={Boolean(Number(data[name]))} onChange={(event) => update(name, event.target.checked ? 1 : 0)} />{label}</label>

  return <div className="general-form technical-form">
    <div className="technical-nav"><button type="button" onClick={onBack}>← Anterior</button><button type="button" onClick={() => onContinue()}>Siguiente →</button></div>
    <FormSection icon="🧑‍💼" title="Personal y Organización">
      <div className="general-grid personnel-grid">{numberField('fijos_h', '¿Cuántos empleados son fijos? Hombres')}{numberField('fijos_m', '¿Cuántos empleados son fijos? Mujeres')}{numberField('tempo_h', '¿Cuántos empleados son temporales? Hombres')}{numberField('tempo_m', '¿Cuántos empleados son temporales? Mujeres')}{numberField('disca_h', '¿Cuántos de ellos tienen discapacidad? Hombres')}{numberField('disca_m', '¿Cuántos de ellos tienen discapacidad? Mujeres')}</div>
      <hr />
      <div className="general-grid">{yesNo('capacita', '¿Capacitan a sus empleados?')}{yesNo('cert_med', '¿Certificados médicos de sus empleados?')}{yesNo('inst_disca', '¿Instalaciones para personas con discapacidad?')}{yesNo('lgbttit', '¿Tienen formación para brindar trato inclusivo a personas LGBTTTIQ+?')}{yesNo('pet_friendly', '¿Es un espacio Pet Friendly?')}</div>
      <hr />
      <div className="general-grid"><label>Tipo de inversión *<select {...field('inversion')} required><option value="">Elegir opción…</option><option value="Nacional">Nacional</option><option value="Ambas">Ambas</option><option value="Extranjera">Extranjera</option></select></label><label>Fecha de inicio de operaciones *<input {...field('inicio_opera')} type="date" required /></label><label>Tipo de organización *<select {...field('organizacion')} required><option value="">Elegir opción…</option><option value="Independiente">Independiente</option><option value="Cadena local">Cadena local</option><option value="Cadena regional">Cadena regional</option><option value="Cadena nacional">Cadena nacional</option><option value="Cadena trasnacional">Cadena trasnacional</option></select></label></div>
    </FormSection>
    <FormSection icon="👥" title="Tipo de Mercado"><p className="section-instruction">Elige al menos una opción.</p><div className="market-grid">{market('local', 'Local')}{market('regional', 'Regional')}{market('nacional', 'Nacional')}{market('internacional', 'Internacional')}</div></FormSection>
    <FormSection icon="📂" title="Cámaras y Asociaciones"><div className="general-grid"><label className="wide">¿A qué cadena, cámara o asociación pertenece?<input {...field('cadenaper')} placeholder="Cámaras o asociaciones turísticas" /></label></div></FormSection>
    {message && <p className="general-message" role="status">{message}</p>}
    <button className="save-general" type="button" disabled={saving} onClick={(event) => save(event.currentTarget.form)}>{saving ? 'Guardando…' : 'Guardar y continuar'} <span>→</span></button>
  </div>
}

const LEGAL_DOCUMENTS = [
  { name: 'rfc', title: 'Constancia de Situación Fiscal / RFC', help: 'No mayor a 3 meses de antigüedad.', always: true },
  { name: 'curp', title: 'CURP', help: 'Documento CURP vigente.' },
  { name: 'ife', title: 'Identificación Oficial con Fotografía / INE', help: 'Identificación vigente.', always: true },
  { name: 'licencia_suelo', title: 'Constancia de Situación Fiscal con actividad económica', help: 'No mayor a 3 meses y con actividad de acuerdo con el giro.', always: true },
  { name: 'escritura_publica', title: 'Escritura Pública / Contrato de Arrendamiento o Comodato', help: 'Debe corresponder al domicilio donde se presta el servicio y estar vigente.', always: true },
  { name: 'acta_constitutiva', title: 'Acta Constitutiva y carta poder del representante', help: 'Obligatorio para personas morales.', moral: true },
  { name: 'rfc_legal', title: 'RFC del representante legal', help: 'Obligatorio para personas morales.', moral: true },
  { name: 'domicilio', title: 'Comprobante de Domicilio', help: 'No mayor a 3 meses y del lugar donde se presta el servicio.', always: true },
  { name: 'protocolo_higiene', title: 'Protocolo de Higiene', help: 'Aplica para hospedaje mediante plataformas digitales.', digital: true },
]

function DatosLegalesStep({ onContinue, onBack }) {
  const [metadata, setMetadata] = useState(null)
  const [selectedFiles, setSelectedFiles] = useState({})
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    apiFetch('/api/form/datos-legales', { signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(); return result })
      .then((result) => setMetadata(result.data))
      .catch((error) => { if (error.name !== 'AbortError') setMessage(safeErrorMessage(error, 'No fue posible cargar el expediente legal.')) })
    return () => controller.abort()
  }, [])

  const isRequired = (document) => document.always || (document.moral && Number(metadata?.tipo_persona) === 2) || (document.digital && Number(metadata?.giro) === 17)
  const selectFile = (name, event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (file.size >= 10 * 1024 * 1024) {
      event.target.value = ''
      setMessage('Cada archivo debe pesar menos de 10 MB.')
      return
    }
    setMessage('')
    setSelectedFiles((current) => ({ ...current, [name]: file }))
  }
  const save = async (form) => {
    if (form && !form.reportValidity()) return
    if (LEGAL_DOCUMENTS.some((document) => isRequired(document) && !metadata.files?.[document.name] && !selectedFiles[document.name])) {
      setMessage('Adjunta todos los documentos obligatorios antes de continuar.')
      return
    }
    setSaving(true)
    setMessage('')
    const formData = new FormData()
    for (const [name, file] of Object.entries(selectedFiles)) formData.append(name, file)
    try {
      const response = await apiFetch('/api/form/datos-legales', { method: 'POST', headers: { 'X-CSRF-Token': readCsrfToken() }, body: formData })
      await response.json()
      if (!response.ok) throw new Error()
      setMessage('Documentos guardados correctamente.')
      onContinue()
    } catch (error) {
      setMessage(safeErrorMessage(error, 'No fue posible guardar los documentos.'))
    } finally {
      setSaving(false)
    }
  }

  if (!metadata) return <div className="form-loading">{message || 'Cargando expediente legal…'}</div>
  return <div className="general-form legal-form">
    <div className="technical-nav"><button type="button" onClick={onBack}>← Anterior</button><button type="button" onClick={onContinue}>Siguiente →</button></div>
    <div className="legal-intro"><div><span className="eyebrow">Paso en curso</span><strong>40% completado</strong></div><p>Adjunta archivos en formato PDF, PNG o JPG con un peso menor a 10 MB cada uno.</p></div>
    <FormSection icon="⚖️" title="Datos Legales de Organización">
      <div className="document-list">{LEGAL_DOCUMENTS.map((document) => {
        const required = isRequired(document)
        const existing = metadata.files?.[document.name]
        const selected = selectedFiles[document.name]
        return <article className="document-card" key={document.name}><div className="document-copy"><strong>{document.title}{required && <b> *</b>}</strong><small>{document.help}</small></div><label className={selected || existing ? 'has-file' : ''}><input type="file" name={document.name} accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(event) => selectFile(document.name, event)} /><span>{selected ? selected.name : existing ? 'Reemplazar archivo' : 'Seleccionar archivo'}</span></label>{existing && !selected && <a href={`/api/form/datos-legales/archivo/${document.name}`} target="_blank" rel="noreferrer">Ver archivo guardado</a>}</article>
      })}</div>
    </FormSection>
    {message && <p className="general-message" role="status">{message}</p>}
    <button className="save-general" type="button" disabled={saving} onClick={(event) => save(event.currentTarget.form)}>{saving ? 'Guardando documentos…' : 'Guardar y continuar'} <span>→</span></button>
  </div>
}

const GRAPHIC_DOCUMENTS = [
  { name: 'imagen_promocional', title: 'Imagen Promocional', help: 'Imagen promocional para guanajuato.mx.', required: true },
  { name: 'logo', title: 'Logotipo', help: 'Logotipo oficial del establecimiento.', required: true },
  { name: 'imagen1', title: 'Fotografía del exterior', help: 'Fotografía exterior del establecimiento.', required: true },
  { name: 'imagen2', title: 'Fotografía del interior', help: 'Fotografía interior del establecimiento.', required: true },
  { name: 'imagen3', title: 'Imagen de las instalaciones', help: 'Fotografía adicional de las instalaciones.' },
]

function DocumentacionGraficaStep({ onContinue, onBack }) {
  const [metadata, setMetadata] = useState(null)
  const [selectedImages, setSelectedImages] = useState({})
  const [accepted, setAccepted] = useState(false)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    apiFetch('/api/form/datos-graficos', { signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(); return result })
      .then((result) => { setMetadata(result.data); setAccepted(Boolean(Number(result.data.promocion_gtomx))) })
      .catch((error) => { if (error.name !== 'AbortError') setMessage(safeErrorMessage(error, 'No fue posible cargar la documentación gráfica.')) })
    return () => controller.abort()
  }, [])
  useEffect(() => () => Object.values(selectedImages).forEach((image) => URL.revokeObjectURL(image.preview)), [selectedImages])

  const selectImage = (name, event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (file.size >= 10 * 1024 * 1024) {
      event.target.value = ''
      setMessage('Cada imagen debe pesar menos de 10 MB.')
      return
    }
    const preview = URL.createObjectURL(file)
    setSelectedImages((current) => ({ ...current, [name]: { file, preview } }))
    setMessage('')
  }
  const save = async () => {
    if (GRAPHIC_DOCUMENTS.some((document) => document.required && !metadata.files?.[document.name] && !selectedImages[document.name])) {
      setMessage('Adjunta todas las imágenes obligatorias antes de continuar.')
      return
    }
    if (!accepted) {
      setMessage('Debes aceptar la validación de la imagen promocional.')
      return
    }
    setSaving(true)
    setMessage('')
    const formData = new FormData()
    formData.append('promocion_gtomx', '1')
    for (const [name, image] of Object.entries(selectedImages)) formData.append(name, image.file)
    try {
      const response = await apiFetch('/api/form/datos-graficos', { method: 'POST', headers: { 'X-CSRF-Token': readCsrfToken() }, body: formData })
      await response.json()
      if (!response.ok) throw new Error()
      setMessage('Imágenes guardadas correctamente.')
      onContinue()
    } catch (error) {
      setMessage(safeErrorMessage(error, 'No fue posible guardar las imágenes.'))
    } finally {
      setSaving(false)
    }
  }

  if (!metadata) return <div className="form-loading">{message || 'Cargando documentación gráfica…'}</div>
  return <div className="general-form graphic-form">
    <div className="technical-nav"><button type="button" onClick={onBack}>← Anterior</button><button type="button" onClick={onContinue}>Siguiente →</button></div>
    <div className="legal-intro"><div><span className="eyebrow">Paso en curso</span><strong>60% completado</strong></div><p>Adjunta imágenes PNG o JPG, menores a 10 MB y con resolución máxima de 5000 × 5000 píxeles.</p></div>
    <FormSection icon="🖼️" title="Documentación Gráfica">
      <div className="graphic-list">{GRAPHIC_DOCUMENTS.map((document) => {
        const selected = selectedImages[document.name]
        const existing = metadata.files?.[document.name]
        const preview = selected?.preview || (existing ? `/api/form/datos-graficos/archivo/${document.name}` : null)
        return <article className="graphic-card" key={document.name}>{preview ? <img src={preview} alt={`Vista previa: ${document.title}`} /> : <div className="graphic-placeholder" aria-hidden="true">🖼️</div>}<div><strong>{document.title}{document.required && <b> *</b>}</strong><small>{document.help}</small><label><input type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" onChange={(event) => selectImage(document.name, event)} /><span>{selected ? selected.file.name : existing ? 'Reemplazar imagen' : 'Seleccionar imagen'}</span></label></div></article>
      })}</div>
    </FormSection>
    <label className="promotion-consent"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /><span>Acepto que la imagen promocional adjunta sea validada para fines de promoción turística en el portal guanajuato.mx por parte del área comercial de la Secretaría de Turismo del Estado de Guanajuato. <b>*</b></span></label>
    {message && <p className="general-message" role="status">{message}</p>}
    <button className="save-general" type="button" disabled={saving} onClick={save}>{saving ? 'Guardando imágenes…' : 'Guardar y continuar'} <span>→</span></button>
  </div>
}

const ROOM_SERVICES = [
  ['cocineta', 'Cocineta'], ['tv', 'Televisión'], ['cajafuerte', 'Caja fuerte'],
  ['cocinetaparcial', 'Cocineta parcial'], ['cable', 'Cable'], ['jacuzzi', 'Jacuzzi'],
  ['aireacondicionado', 'Aire acondicionado'], ['telefono', 'Teléfono'],
  ['aguacaliente', 'Agua caliente'], ['ventilador', 'Ventilador'], ['minibar', 'Minibar'],
]
const COMMON_SERVICES = [
  ['cafeteria', 'Cafetería'], ['bar', 'Bar'], ['acceso', 'Acceso para personas con capacidades diferentes'],
  ['restaurante', 'Restaurante'], ['boutique', 'Boutique'], ['agencia', 'Agencia de viajes'],
  ['cocinaindustrial', 'Cocina industrial'], ['regalo', 'Regalos'], ['spa', 'Spa'],
  ['banquete', 'Banquetes y convenciones'], ['tabaqueria', 'Tabaquería'], ['room', 'Room Service'],
  ['salon', 'Salones de eventos'], ['internet', 'Internet'], ['floreria', 'Florería'],
  ['alberca', 'Alberca'], ['sala', 'Sala de belleza y peluquería'], ['arrendadora', 'Arrendadora de vehículos'],
  ['chapoteadero', 'Chapoteadero'], ['gimnasio', 'Gimnasio'], ['golf', 'Campo de golf'],
  ['area', 'Áreas verdes'], ['lavanderia', 'Lavandería'], ['tenis', 'Cancha de tenis'],
  ['juego', 'Juegos infantiles'], ['tintoreria', 'Tintorería'], ['ejecutivo', 'Centro ejecutivo'],
  ['actividad', 'Actividades recreativas'], ['elevador', 'Elevador'], ['estacionamiento', 'Estacionamiento'],
]
const LODGING_TYPES = ['Hotel', 'Motel', 'Resorts', 'Hostal - Posada', 'Albergue', 'Amueblados', 'Campamentos', 'Trailer Parks', 'Suites', 'Villas', 'Bungalows', 'Casa de Huéspedes']

function HospedajeStep({ onContinue, onBack }) {
  const [data, setData] = useState(null)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    apiFetch('/api/form/hospedaje', { signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(); return result })
      .then((result) => setData(result.data))
      .catch((error) => { if (error.name !== 'AbortError') setMessage(safeErrorMessage(error, 'No fue posible cargar el formulario de hospedaje.')) })
    return () => controller.abort()
  }, [])
  const update = (name, value) => setData((current) => ({ ...current, [name]: value }))
  const field = (name) => ({ value: data[name] ?? '', onChange: (event) => update(name, event.target.value) })
  const option = ([name, label]) => <label className="lodging-option" key={name}><input type="checkbox" checked={Boolean(Number(data[name]))} onChange={(event) => update(name, Number(event.target.checked))} /><span>{label}</span></label>
  const save = async (form) => {
    if (form && !form.reportValidity()) return
    setSaving(true); setMessage('')
    try {
      const response = await apiFetch('/api/form/hospedaje', { method: 'PUT', headers: { 'content-type': 'application/json', 'X-CSRF-Token': readCsrfToken() }, body: JSON.stringify(data) })
      await response.json()
      if (!response.ok) throw new Error()
      setMessage('Formulario de hospedaje guardado correctamente.'); onContinue()
    } catch (error) {
      setMessage(safeErrorMessage(error, 'No fue posible guardar el formulario de hospedaje.'))
    } finally { setSaving(false) }
  }
  if (!data) return <div className="form-loading">{message || 'Cargando formulario de hospedaje…'}</div>
  return <div className="general-form lodging-form">
    <div className="technical-nav"><button type="button" onClick={onBack}>← Anterior</button><button type="button" onClick={onContinue}>Siguiente →</button></div>
    <div className="legal-intro"><div><span className="eyebrow">Paso en curso</span><strong>80% completado</strong></div><p>Los campos marcados como obligatorios deben capturarse antes de continuar.</p></div>
    <FormSection icon="🏨" title="Hospedaje">
      <div className="general-grid">
        <label>Tipo de establecimiento de hospedaje *<select {...field('establecimiento')} required><option value="">Elegir opción…</option>{LODGING_TYPES.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Tipo *<select {...field('tipo')} required><option value="">Elegir opción…</option>{['Boutique', 'Negocios', 'Tradicional', 'Tránsito', 'Vacacional'].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Tipo 2 *<select {...field('tipo2')} required><option value="">Elegir opción…</option>{['Independiente', 'Operadora'].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Número de habitaciones *<input {...field('cuartos')} type="number" min="0" max="999999" required /></label>
        <label>Número de pisos *<input {...field('pisos')} type="number" min="0" max="999" required /></label>
      </div>
    </FormSection>
    <FormSection icon="🛏️" title="Servicios en las Habitaciones"><p className="section-instruction">Selecciona los servicios con los que cuentan las habitaciones.</p><div className="lodging-options">{ROOM_SERVICES.map(option)}</div></FormSection>
    <FormSection icon="🔔" title="Servicios Comunes"><p className="section-instruction">Selecciona los servicios comunes del establecimiento.</p><div className="lodging-options">{COMMON_SERVICES.map(option)}</div></FormSection>
    <FormSection icon="🚗" title="Estacionamiento">
      <div className="general-grid"><label>Número de cajones<input {...field('nocajon')} type="number" min="0" max="9999" /></label><label>Tipo de estacionamiento<select {...field('tipocajon')}><option value="">Elegir opción…</option><option>Interno</option><option>Externo</option></select></label></div>
    </FormSection>
    <FormSection icon="🛡️" title="Seguridad y transporte">
      <div className="general-grid">
        <label>¿Cuenta con seguro de responsabilidad? *<select {...field('seguro')} required><option value="">Elegir opción…</option><option value="0">No</option><option value="1">Sí</option></select></label>
        <label>¿Cuál aseguradora?{Number(data.seguro) === 1 && ' *'}<input {...field('aseguradora')} disabled={Number(data.seguro) !== 1} required={Number(data.seguro) === 1} maxLength="50" /></label>
        <label>¿Cuenta con unidades y espacios para paraderos?<select {...field('unidad')}><option value="">Elegir opción…</option><option value="0">No</option><option value="1">Sí</option></select></label>
      </div>
    </FormSection>
    {message && <p className="general-message" role="status">{message}</p>}
    <button className="save-general" type="button" disabled={saving} onClick={(event) => save(event.currentTarget.form)}>{saving ? 'Guardando hospedaje…' : 'Guardar y continuar'} <span>→</span></button>
  </div>
}

const AGENCY_MODALITIES = ['Minorista', 'Emisora', 'Receptora', 'Operadores', 'Mayorista', 'Sub Agencias']
const AGENCY_SEGMENTS = ['Aventura y Naturaleza', 'Turismo Cultural', 'Turismo de Negocios', 'Reuniones', 'Historia y Cultura', 'Historia', 'Turismo Deportivo', 'Salud', 'Rural', 'Gastronómico']

function AgenciaStep({ onContinue, onBack }) {
  const [data, setData] = useState(null)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    apiFetch('/api/form/agencia', { signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(); return result })
      .then((result) => setData(result.data))
      .catch((error) => { if (error.name !== 'AbortError') setMessage(safeErrorMessage(error, 'No fue posible cargar el formulario de agencia de viajes.')) })
    return () => controller.abort()
  }, [])
  const update = (name, value) => setData((current) => ({ ...current, [name]: value }))
  const field = (name) => ({ value: data[name] ?? '', onChange: (event) => update(name, event.target.value) })
  const save = async (form) => {
    if (form && !form.reportValidity()) return
    setSaving(true); setMessage('')
    try {
      const response = await apiFetch('/api/form/agencia', { method: 'PUT', headers: { 'content-type': 'application/json', 'X-CSRF-Token': readCsrfToken() }, body: JSON.stringify(data) })
      await response.json()
      if (!response.ok) throw new Error()
      onContinue()
    } catch (error) {
      setMessage(safeErrorMessage(error, 'No fue posible guardar el formulario de agencia de viajes.'))
    } finally { setSaving(false) }
  }
  if (!data) return <div className="form-loading">{message || 'Cargando formulario de agencia de viajes…'}</div>
  return <div className="general-form agency-form">
    <div className="technical-nav"><button type="button" onClick={onBack}>← Anterior</button><button type="button" onClick={onContinue}>Siguiente →</button></div>
    <div className="legal-intro"><div><span className="eyebrow">Paso en curso</span><strong>80% completado</strong></div><p>Captura la clasificación comercial de la agencia antes de continuar.</p></div>
    <FormSection icon="✈️" title="Agencia de Viajes">
      <div className="general-grid">
        <label>Modalidad *<select {...field('modalidad')} required><option value="">Elegir opción…</option>{AGENCY_MODALITIES.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Segmento *<select {...field('segmento')} required><option value="">Elegir opción…</option>{AGENCY_SEGMENTS.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>¿Pertenece a una asociación? *<select {...field('asociacion')} required><option value="">Elegir opción…</option><option value="0">No</option><option value="1">Sí</option></select></label>
        <label>Nombre de la asociación{Number(data.asociacion) === 1 && ' *'}<input {...field('nombre_asociacion')} disabled={Number(data.asociacion) !== 1} required={Number(data.asociacion) === 1} maxLength="100" placeholder="Nombre de la asociación" /></label>
      </div>
    </FormSection>
    {message && <p className="general-message" role="status">{message}</p>}
    <button className="save-general" type="button" disabled={saving} onClick={(event) => save(event.currentTarget.form)}>{saving ? 'Guardando agencia…' : 'Guardar y continuar'} <span>→</span></button>
  </div>
}

const GUIDE_CLASSIFICATIONS = ['Local', 'General', 'Naturaleza', 'Guía Especializado en actividad específica', 'Especializado en Actividades específicas de Naturaleza y/o Aventura', 'Guía Especializado']
const GUIDE_TYPES = [
  ['tip_historia', 'Historia'], ['tip_arte', 'Arte'], ['tip_cultura', 'Cultura'],
  ['tip_museos', 'Museos'], ['tip_religiosos', 'Sitios religiosos'],
  ['tip_compras', 'Compras'], ['tip_aventura', 'Aventura'],
]
const GUIDE_LANGUAGES = [
  ['esp', 'Español'], ['fra', 'Francés'], ['eng', 'Inglés'], ['ita', 'Italiano'],
  ['ale', 'Alemán'], ['cor', 'Coreano'], ['por', 'Portugués'],
]

function GuiaStep({ onContinue, onBack }) {
  const [data, setData] = useState(null)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    apiFetch('/api/form/guia', { signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(); return result })
      .then((result) => setData(result.data))
      .catch((error) => { if (error.name !== 'AbortError') setMessage(safeErrorMessage(error, 'No fue posible cargar el formulario de guía de turistas.')) })
    return () => controller.abort()
  }, [])
  const update = (name, value) => setData((current) => ({ ...current, [name]: value }))
  const field = (name) => ({ value: data[name] ?? '', onChange: (event) => update(name, event.target.value) })
  const checkbox = ([name, label]) => <label className="lodging-option" key={name}><input type="checkbox" checked={Boolean(Number(data[name]))} onChange={(event) => update(name, Number(event.target.checked))} /><span>{label}</span></label>
  const save = async (form) => {
    if (form && !form.reportValidity()) return
    if (!GUIDE_TYPES.some(([name]) => Number(data[name]) === 1)) { setMessage('Selecciona al menos un tipo de recorrido.'); return }
    if (!GUIDE_LANGUAGES.some(([name]) => Number(data[name]) === 1) && !String(data.otro_idioma || '').trim()) { setMessage('Selecciona o captura al menos un idioma.'); return }
    setSaving(true); setMessage('')
    try {
      const response = await apiFetch('/api/form/guia', { method: 'PUT', headers: { 'content-type': 'application/json', 'X-CSRF-Token': readCsrfToken() }, body: JSON.stringify(data) })
      await response.json()
      if (!response.ok) throw new Error()
      onContinue()
    } catch (error) {
      setMessage(safeErrorMessage(error, 'No fue posible guardar el formulario de guía de turistas.'))
    } finally { setSaving(false) }
  }
  if (!data) return <div className="form-loading">{message || 'Cargando formulario de guía de turistas…'}</div>
  return <div className="general-form guide-form">
    <div className="technical-nav"><button type="button" onClick={onBack}>← Anterior</button><button type="button" onClick={onContinue}>Siguiente →</button></div>
    <div className="legal-intro"><div><span className="eyebrow">Paso en curso</span><strong>80% completado</strong></div><p>Captura la clasificación, especialidades e idiomas del guía.</p></div>
    <FormSection icon="🧭" title="Clasificación del Guía">
      <div className="general-grid">
        <label>Tipo de guía *<select {...field('guia')} required><option value="">Elegir opción…</option>{GUIDE_CLASSIFICATIONS.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Número de credencial *<input {...field('num_credencial')} required maxLength="50" placeholder="Número de credencial" /></label>
        <label className="wide">Nombre de la asociación<input {...field('nombre_asociacion')} maxLength="100" placeholder="Opcional" /></label>
      </div>
    </FormSection>
    <FormSection icon="🗺️" title="Tipos de Recorrido"><p className="section-instruction">Selecciona al menos una especialidad.</p><div className="lodging-options">{GUIDE_TYPES.map(checkbox)}</div></FormSection>
    <FormSection icon="💬" title="Idiomas"><p className="section-instruction">Selecciona los idiomas que dominas o captura uno adicional.</p><div className="lodging-options">{GUIDE_LANGUAGES.map(checkbox)}</div><div className="general-grid"><label className="wide">Otro idioma<input {...field('otro_idioma')} maxLength="50" placeholder="Otro idioma" /></label></div></FormSection>
    {message && <p className="general-message" role="status">{message}</p>}
    <button className="save-general" type="button" disabled={saving} onClick={(event) => save(event.currentTarget.form)}>{saving ? 'Guardando guía…' : 'Guardar y continuar'} <span>→</span></button>
  </div>
}

function PromotoresStep({ onContinue, onBack }) {
  const [data, setData] = useState(null)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    apiFetch('/api/form/promotores', { signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(); return result })
      .then((result) => setData(result.data))
      .catch((error) => { if (error.name !== 'AbortError') setMessage(safeErrorMessage(error, 'No fue posible cargar el formulario de operador de eventos.')) })
    return () => controller.abort()
  }, [])
  const update = (name, value) => setData((current) => ({ ...current, [name]: value }))
  const field = (name) => ({ value: data[name] ?? '', onChange: (event) => update(name, event.target.value) })
  const save = async (form) => {
    if (form && !form.reportValidity()) return
    setSaving(true); setMessage('')
    try {
      const response = await apiFetch('/api/form/promotores', { method: 'PUT', headers: { 'content-type': 'application/json', 'X-CSRF-Token': readCsrfToken() }, body: JSON.stringify(data) })
      await response.json()
      if (!response.ok) throw new Error()
      onContinue()
    } catch (error) {
      setMessage(safeErrorMessage(error, 'No fue posible guardar el formulario de operador de eventos.'))
    } finally { setSaving(false) }
  }
  if (!data) return <div className="form-loading">{message || 'Cargando formulario de operador de eventos…'}</div>
  return <div className="general-form promoter-form">
    <div className="technical-nav"><button type="button" onClick={onBack}>← Anterior</button><button type="button" onClick={onContinue}>Siguiente →</button></div>
    <div className="legal-intro"><div><span className="eyebrow">Paso en curso</span><strong>80% completado</strong></div><p>Captura la información operativa y los convenios del establecimiento.</p></div>
    <FormSection icon="🎪" title="Operador y Organizador de Eventos">
      <div className="general-grid">
        <label>¿Cuenta con licencia? *<select {...field('licencia')} required><option value="">Elegir opción…</option><option value="0">No</option><option value="1">Sí</option></select></label>
        <label>Zona de operación *<select {...field('zona')} required><option value="">Elegir opción…</option><option value="Establecimiento">Establecimiento</option><option value="Local">Local</option><option value="Via">Vía</option><option value="Aventura">Aventura</option></select></label>
        <label>¿Cuenta con convenio? *<select {...field('convenio')} required><option value="">Elegir opción…</option><option value="0">No</option><option value="1">Sí</option></select></label>
        <label>Descripción del convenio{Number(data.convenio) === 1 && ' *'}<input {...field('txt_convenio')} disabled={Number(data.convenio) !== 1} required={Number(data.convenio) === 1} maxLength="50" placeholder="Convenio o institución" /></label>
      </div>
    </FormSection>
    {message && <p className="general-message" role="status">{message}</p>}
    <button className="save-general" type="button" disabled={saving} onClick={(event) => save(event.currentTarget.form)}>{saving ? 'Guardando operador…' : 'Guardar y continuar'} <span>→</span></button>
  </div>
}

const RESTAURANT_SCHEDULES = [['hro_matutino', 'Matutino'], ['hro_vespertino', 'Vespertino'], ['hro_diurno', 'Diurno'], ['hro_nocturno', 'Nocturno']]
const RESTAURANT_SERVICE_MODES = [['op_mesa', 'Servicio en mesa'], ['op_autoservicio', 'Autoservicio'], ['op_buffete', 'Buffet'], ['op_alacarta', 'A la carta']]
const RESTAURANT_TYPES = ['Restaurante', 'Cafeteria', 'Bar/Cantina', 'Bares y Cantinas', 'Centro Nocturno']
const RESTAURANT_KITCHENS = ['Mexicana', 'Internacional', 'Otros', 'Asiática', 'Italiana', 'Carnes', 'Del Mar', 'Del_Mar']

function RestaurantesStep({ onContinue, onBack }) {
  const [data, setData] = useState(null)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    apiFetch('/api/form/restaurantes', { signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(); return result })
      .then((result) => setData(result.data))
      .catch((error) => { if (error.name !== 'AbortError') setMessage(safeErrorMessage(error, 'No fue posible cargar el formulario de alimentos y bebidas.')) })
    return () => controller.abort()
  }, [])
  const update = (name, value) => setData((current) => ({ ...current, [name]: value }))
  const field = (name) => ({ value: data[name] ?? '', onChange: (event) => update(name, event.target.value) })
  const checkbox = ([name, label]) => <label className="lodging-option" key={name}><input type="checkbox" checked={Boolean(Number(data[name]))} onChange={(event) => update(name, Number(event.target.checked))} /><span>{label}</span></label>
  const save = async (form) => {
    if (form && !form.reportValidity()) return
    if (!RESTAURANT_SCHEDULES.some(([name]) => Number(data[name]) === 1)) { setMessage('Selecciona al menos un horario de operación.'); return }
    if (!RESTAURANT_SERVICE_MODES.some(([name]) => Number(data[name]) === 1)) { setMessage('Selecciona al menos una modalidad de servicio.'); return }
    setSaving(true); setMessage('')
    try {
      const response = await apiFetch('/api/form/restaurantes', { method: 'PUT', headers: { 'content-type': 'application/json', 'X-CSRF-Token': readCsrfToken() }, body: JSON.stringify(data) })
      await response.json()
      if (!response.ok) throw new Error()
      onContinue()
    } catch (error) {
      setMessage(safeErrorMessage(error, 'No fue posible guardar el formulario de alimentos y bebidas.'))
    } finally { setSaving(false) }
  }
  if (!data) return <div className="form-loading">{message || 'Cargando formulario de alimentos y bebidas…'}</div>
  return <div className="general-form restaurant-form">
    <div className="technical-nav"><button type="button" onClick={onBack}>← Anterior</button><button type="button" onClick={onContinue}>Siguiente →</button></div>
    <div className="legal-intro"><div><span className="eyebrow">Paso en curso</span><strong>80% completado</strong></div><p>Captura la operación, capacidad y clasificación del establecimiento.</p></div>
    <FormSection icon="🍽️" title="Servicios de Alimentos y Bebidas">
      <div className="general-grid">
        <label>Tipo de establecimiento *<select {...field('tipo_establecimiento')} required><option value="">Elegir opción…</option>{RESTAURANT_TYPES.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Tipo de cocina *<select {...field('tipo_cocina')} required><option value="">Elegir opción…</option>{RESTAURANT_KITCHENS.map((value) => <option key={value} value={value}>{value === 'Del_Mar' ? 'Del Mar (catálogo anterior)' : value}</option>)}</select></label>
        <label>¿Cuenta con licencia? *<select {...field('licencia')} required><option value="">Elegir opción…</option><option value="No">No</option><option value="Si">Sí</option></select></label>
        <label>Número de licencia{data.licencia === 'Si' && ' *'}<input {...field('num_licencia')} disabled={data.licencia !== 'Si'} required={data.licencia === 'Si'} maxLength="40" /></label>
        <label>¿Cuenta con permiso? *<select {...field('permiso')} required><option value="">Elegir opción…</option><option value="No">No</option><option value="Si">Sí</option></select></label>
        <label>Número de permiso de bebidas{data.permiso === 'Si' && ' *'}<input {...field('num_bebidas')} disabled={data.permiso !== 'Si'} required={data.permiso === 'Si'} maxLength="40" /></label>
        <label>Tipo de servicio *<select {...field('tipo_servicio')} required><option value="">Elegir opción…</option><option value="0">Tipo 0</option><option value="1">Tipo 1</option><option value="2">Tipo 2</option></select></label>
      </div>
    </FormSection>
    <FormSection icon="🕐" title="Horarios de Operación"><p className="section-instruction">Selecciona al menos un horario.</p><div className="lodging-options">{RESTAURANT_SCHEDULES.map(checkbox)}</div></FormSection>
    <FormSection icon="🧾" title="Modalidades de Servicio"><p className="section-instruction">Selecciona al menos una modalidad.</p><div className="lodging-options">{RESTAURANT_SERVICE_MODES.map(checkbox)}</div></FormSection>
    <FormSection icon="👥" title="Capacidad">
      <div className="general-grid"><label>Número de clientes potenciales *<input {...field('num_potenciales')} type="number" min="0" max="32767" required /></label><label>Número de mesas *<input {...field('num_mesas')} type="number" min="0" max="32767" required /></label></div>
    </FormSection>
    {message && <p className="general-message" role="status">{message}</p>}
    <button className="save-general" type="button" disabled={saving} onClick={(event) => save(event.currentTarget.form)}>{saving ? 'Guardando establecimiento…' : 'Guardar y continuar'} <span>→</span></button>
  </div>
}

const GOLF_TERRAINS = [['plano', 'Plano'], ['semiplano', 'Semiplano'], ['ondulado', 'Ondulado']]
const GOLF_SERVICES = [
  ['serv01', 'Casa Club'],
  ['serv02', 'Putting Green'],
  ['serv03', 'Marcas de Yardas'],
  ['serv04', 'Clases de Golf'],
  ['serv05', 'Restaurante'],
  ['serv06', 'Reservación de Salidas'],
  ['serv07', 'Tee de Práctica'],
  ['serv08', 'Renta de Autos'],
  ['serv09', 'Tienda Profesional'],
]
const GOLF_PAYMENTS = [
  ['tc01', 'American Express'],
  ['tc02', 'Visa'],
  ['tc03', 'Master Card'],
  ['tc04', 'Efectivo'],
  ['tc05', 'Cheque de Viajero'],
  ['tc06', 'Otra'],
]

function GolfStep({ onContinue, onBack }) {
  const [data, setData] = useState(null)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    apiFetch('/api/form/golf', { signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(); return result })
      .then((result) => setData(result.data))
      .catch((error) => { if (error.name !== 'AbortError') setMessage(safeErrorMessage(error, 'No fue posible cargar el formulario de campo de golf.')) })
    return () => controller.abort()
  }, [])
  const update = (name, value) => setData((current) => ({ ...current, [name]: value }))
  const field = (name) => ({ value: data[name] ?? '', onChange: (event) => update(name, event.target.value) })
  const checkbox = ([name, label]) => <label className="lodging-option" key={name}><input type="checkbox" checked={Boolean(Number(data[name]))} onChange={(event) => update(name, Number(event.target.checked))} /><span>{label}</span></label>
  const yesNo = (name, label) => <label>{label} *<select {...field(name)} required><option value="">Elegir opción…</option><option value="No">No</option><option value="Si">Sí</option></select></label>
  const save = async (form) => {
    if (form && !form.reportValidity()) return
    if (!GOLF_TERRAINS.some(([name]) => Number(data[name]) === 1)) { setMessage('Selecciona al menos un tipo de terreno.'); return }
    setSaving(true); setMessage('')
    try {
      const response = await apiFetch('/api/form/golf', { method: 'PUT', headers: { 'content-type': 'application/json', 'X-CSRF-Token': readCsrfToken() }, body: JSON.stringify(data) })
      await response.json()
      if (!response.ok) throw new Error()
      onContinue()
    } catch (error) {
      setMessage(safeErrorMessage(error, 'No fue posible guardar el formulario de campo de golf.'))
    } finally { setSaving(false) }
  }
  if (!data) return <div className="form-loading">{message || 'Cargando formulario de campo de golf…'}</div>
  return <div className="general-form golf-form">
    <div className="technical-nav"><button type="button" onClick={onBack}>← Anterior</button><button type="button" onClick={onContinue}>Siguiente →</button></div>
    <div className="legal-intro"><div><span className="eyebrow">Paso en curso</span><strong>80% completado</strong></div><p>Captura las características, servicios y medios de pago del campo.</p></div>
    <FormSection icon="⛳" title="Campo de Golf">
      <div className="general-grid">
        {yesNo('turistico', 'El campo es')}{yesNo('carrito', 'Uso obligatorio de carrito')}{yesNo('privado', 'Privado con facilidades')}
        <label>Número de Hoyos *<input {...field('hoyos')} type="number" min="1" max="999" required /></label>
        <label>Par *<input {...field('par')} type="number" min="1" max="999" required /></label>
        <label>Longitud en Yardas *<input {...field('longitud')} type="number" min="1" max="9999999" required /></label>
        <label>Diseñador del campo *<input {...field('disenado')} maxLength="120" required /></label>
        <label>Tipo de pasto (Fairways) *<input {...field('fairways')} maxLength="120" required /></label>
        <label>Tipo de pasto (Greens) *<input {...field('greens')} maxLength="120" required /></label>
      </div>
    </FormSection>
    <FormSection icon="🏞️" title="Tipo de Terreno"><p className="section-instruction">Selecciona al menos una opción.</p><div className="lodging-options">{GOLF_TERRAINS.map(checkbox)}</div></FormSection>
    <FormSection icon="🏌️" title="Servicios"><div className="lodging-options">{GOLF_SERVICES.map(checkbox)}</div></FormSection>
    <FormSection icon="💳" title="Tarjetas y Medios de Pago"><div className="lodging-options">{GOLF_PAYMENTS.map(checkbox)}</div><div className="general-grid"><label className="wide">Otra, ¿Cuál?<input {...field('otra_tc')} maxLength="120" placeholder="Especifica otra forma de pago" /></label></div></FormSection>
    {message && <p className="general-message" role="status">{message}</p>}
    <button className="save-general" type="button" disabled={saving} onClick={(event) => save(event.currentTarget.form)}>{saving ? 'Guardando campo…' : 'Guardar y continuar'} <span>→</span></button>
  </div>
}

const ART_TYPES = [
  ['tipo1', 'Establecimiento de dulces típicos'],
  ['tipo2', 'Galerías de arte y salas de exhibición'],
  ['tipo3', 'Establecimiento de artesanías'],
  ['tipo4', 'Establecimiento de productos típicos'],
]

function ArteStep({ onContinue, onBack }) {
  const [data, setData] = useState(null)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    apiFetch('/api/form/arte', { signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(); return result })
      .then((result) => setData(result.data))
      .catch((error) => { if (error.name !== 'AbortError') setMessage(safeErrorMessage(error, 'No fue posible cargar el formulario de arte popular.')) })
    return () => controller.abort()
  }, [])
  const update = (name, value) => setData((current) => ({ ...current, [name]: value }))
  const field = (name) => ({ value: data[name] ?? '', onChange: (event) => update(name, event.target.value) })
  const checkbox = ([name, label]) => <label className="lodging-option" key={name}><input type="checkbox" checked={Boolean(Number(data[name]))} onChange={(event) => update(name, Number(event.target.checked))} /><span>{label}</span></label>
  const save = async (form) => {
    if (form && !form.reportValidity()) return
    if (!ART_TYPES.some(([name]) => Number(data[name]) === 1)) { setMessage('Selecciona al menos un tipo de establecimiento.'); return }
    setSaving(true); setMessage('')
    try {
      const response = await apiFetch('/api/form/arte', { method: 'PUT', headers: { 'content-type': 'application/json', 'X-CSRF-Token': readCsrfToken() }, body: JSON.stringify(data) })
      await response.json()
      if (!response.ok) throw new Error()
      onContinue()
    } catch (error) {
      setMessage(safeErrorMessage(error, 'No fue posible guardar el formulario de arte popular.'))
    } finally { setSaving(false) }
  }
  if (!data) return <div className="form-loading">{message || 'Cargando formulario de arte popular…'}</div>
  return <div className="general-form art-form">
    <div className="technical-nav"><button type="button" onClick={onBack}>← Anterior</button><button type="button" onClick={onContinue}>Siguiente →</button></div>
    <div className="legal-intro"><div><span className="eyebrow">Paso en curso</span><strong>80% completado</strong></div><p>Describe el tipo de arte o producto y la modalidad de operación.</p></div>
    <FormSection icon="🏺" title="Arte Popular y Productos">
      <p className="section-instruction">Selecciona al menos un tipo de establecimiento.</p>
      <div className="lodging-options">{ART_TYPES.map(checkbox)}</div>
      <div className="general-grid"><label>Operación *<select {...field('operacion')} required><option value="">Elegir opción…</option><option value="Temporal">Temporal</option><option value="Permanentes">Permanentes</option></select></label></div>
      <label className="description-field">Descripción del arte, dulces, productos o artesanías *<textarea {...field('descripcion')} maxLength="5000" rows="6" required placeholder="Describe los productos o expresiones de arte que ofrece el establecimiento" /></label>
    </FormSection>
    {message && <p className="general-message" role="status">{message}</p>}
    <button className="save-general" type="button" disabled={saving} onClick={(event) => save(event.currentTarget.form)}>{saving ? 'Guardando establecimiento…' : 'Guardar y continuar'} <span>→</span></button>
  </div>
}

const RENTAL_PERMITS = [['perm1', 'Municipal'], ['perm2', 'Estatal'], ['perm3', 'Federal']]
const RENTAL_FEATURES = [
  ['caract1', 'Aire Acondicionado'],
  ['caract2', 'Cafetería a Bordo'],
  ['caract3', 'Servicio de Edecanes'],
  ['caract4', 'Primeros Auxilios'],
  ['caract5', 'Transporte de Equipo Especial'],
  ['caract6', 'Bar a Bordo'],
  ['caract7', 'Restaurante a Bordo'],
  ['caract8', 'Tours Guiados'],
  ['caract9', 'Guía'],
  ['caract10', 'Paquetes Promocionales'],
  ['caract11', 'Abordaje a Domicilio'],
  ['caract12', 'Salón VIP'],
  ['caract13', 'Transporte de Menaje'],
  ['caract14', 'Transporte de Vehículos'],
]
const RENTAL_MODALITIES = [
  ['mod01', 'Vuelos Comerciales'],
  ['mod02', 'Vuelos Charters'],
  ['mod03', 'Autobuses Comerciales'],
  ['mod04', 'Autobuses Especiales de Turismo'],
  ['mod05', 'Taxis'],
]
const RENTAL_SERVICES = [
  ['serv01', 'Automóviles'],
  ['serv02', 'Bicicletas y Motocicletas'],
  ['serv03', 'Combis y Vans'],
  ['serv04', 'Limousines'],
  ['serv05', 'Autobuses'],
  ['serv06', 'Campers'],
  ['serv07', 'Vehículos para Carretera'],
  ['serv08', 'Motocicletas'],
  ['serv09', 'Bicicletas'],
  ['serv10', 'Aviones'],
  ['serv11', 'Ultraligeros'],
  ['serv12', 'Planeadores'],
]
const RENTAL_PAYMENTS = [
  ['tc01', 'American Express'],
  ['tc02', 'Visa'],
  ['tc03', 'Master Card'],
  ['tc04', 'Efectivo'],
  ['tc05', 'Cheque de Viajero'],
  ['tc06', 'Otra'],
]

function ArrendadoraStep({ onContinue, onBack }) {
  const [data, setData] = useState(null)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    apiFetch('/api/form/arrendadora', { signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(); return result })
      .then((result) => setData(result.data))
      .catch((error) => { if (error.name !== 'AbortError') setMessage(safeErrorMessage(error, 'No fue posible cargar el formulario de arrendamiento de autos.')) })
    return () => controller.abort()
  }, [])
  const update = (name, value) => setData((current) => ({ ...current, [name]: value }))
  const field = (name) => ({ value: data[name] ?? '', onChange: (event) => update(name, event.target.value) })
  const checkbox = ([name, label]) => <label className="lodging-option" key={name}><input type="checkbox" checked={Boolean(Number(data[name]))} onChange={(event) => update(name, Number(event.target.checked))} /><span>{label}</span></label>
  const hasChecked = (options) => options.some(([name]) => Number(data[name]) === 1)
  const save = async (form) => {
    if (form && !form.reportValidity()) return
    if (!hasChecked(RENTAL_PERMITS)) { setMessage('Selecciona al menos un permiso.'); return }
    if (!hasChecked(RENTAL_FEATURES)) { setMessage('Selecciona al menos una característica.'); return }
    if (!hasChecked(RENTAL_MODALITIES)) { setMessage('Selecciona al menos una modalidad.'); return }
    if (!hasChecked(RENTAL_SERVICES)) { setMessage('Selecciona al menos una unidad o servicio.'); return }
    if (!hasChecked(RENTAL_PAYMENTS) && !String(data.otra_tc || '').trim()) { setMessage('Selecciona o captura al menos una forma de pago.'); return }
    setSaving(true); setMessage('')
    try {
      const response = await apiFetch('/api/form/arrendadora', { method: 'PUT', headers: { 'content-type': 'application/json', 'X-CSRF-Token': readCsrfToken() }, body: JSON.stringify(data) })
      await response.json()
      if (!response.ok) throw new Error()
      onContinue()
    } catch (error) {
      setMessage(safeErrorMessage(error, 'No fue posible guardar el formulario de arrendamiento de autos.'))
    } finally { setSaving(false) }
  }
  if (!data) return <div className="form-loading">{message || 'Cargando formulario de arrendamiento de autos…'}</div>
  return <div className="general-form rental-form">
    <div className="technical-nav"><button type="button" onClick={onBack}>← Anterior</button><button type="button" onClick={onContinue}>Siguiente →</button></div>
    <div className="legal-intro"><div><span className="eyebrow">Paso en curso</span><strong>80% completado</strong></div><p>Captura las unidades, permisos, características y servicios de la arrendadora.</p></div>
    <FormSection icon="🚗" title="Arrendamiento de Autos">
      <div className="general-grid">
        <label>Número de unidades *<input {...field('novehiculos')} type="number" min="1" max="999999999" required /></label>
        <label>Tipo de unidades *<input {...field('tipovehiculos')} maxLength="120" required /></label>
        <label>Capacidad de unidades *<input {...field('capavehiculos')} maxLength="120" required /></label>
      </div>
    </FormSection>
    <FormSection icon="📄" title="Permisos"><p className="section-instruction">Selecciona al menos un permiso.</p><div className="lodging-options">{RENTAL_PERMITS.map(checkbox)}</div></FormSection>
    <FormSection icon="✓" title="Características del Servicio"><div className="lodging-options">{RENTAL_FEATURES.map(checkbox)}</div></FormSection>
    <FormSection icon="🛣️" title="Modalidad de Transporte"><div className="lodging-options">{RENTAL_MODALITIES.map(checkbox)}</div></FormSection>
    <FormSection icon="🚙" title="Tipos de Unidades y Servicios"><div className="lodging-options">{RENTAL_SERVICES.map(checkbox)}</div></FormSection>
    <FormSection icon="💳" title="Formas de Pago"><div className="lodging-options">{RENTAL_PAYMENTS.map(checkbox)}</div><div className="general-grid"><label className="wide">Otra, ¿Cuál?<input {...field('otra_tc')} maxLength="120" /></label></div></FormSection>
    {message && <p className="general-message" role="status">{message}</p>}
    <button className="save-general" type="button" disabled={saving} onClick={(event) => save(event.currentTarget.form)}>{saving ? 'Guardando arrendadora…' : 'Guardar y continuar'} <span>→</span></button>
  </div>
}

const PARK_SERVICES = [
  ['serv01', 'Agencia de viajes'],
  ['serv02', 'Jardines'],
  ['serv03', 'Zona de carga y descarga'],
  ['serv04', 'Área de registro'],
  ['serv05', 'Restaurante'],
  ['serv06', 'Cafetería'],
  ['serv07', 'Arrendadora de auto'],
  ['serv08', 'Asesoría financiera'],
  ['serv09', 'Centro de negocios'],
  ['serv10', 'Centro de servicios'],
  ['serv11', 'Edecanes'],
  ['serv12', 'Equipo audiovisual'],
  ['serv13', 'Equipo de sonido'],
  ['serv14', 'Estacionamiento'],
  ['serv15', 'Fax'],
  ['serv16', 'Florería'],
  ['serv17', 'Guía de turismo'],
  ['serv18', 'Colgado de lonas y mantas'],
  ['serv19', 'Mobiliario de montaje'],
  ['serv20', 'Montaje de stands'],
  ['serv21', 'Oficinas administrativas'],
  ['serv22', 'Renta de bodegas'],
  ['serv23', 'Renta de taquillas'],
  ['serv24', 'Sanitarios'],
  ['serv25', 'Servicio médico'],
  ['serv26', 'Guardería'],
  ['serv27', 'Servicio de taxis'],
  ['serv28', 'Tabaquería'],
  ['serv29', 'Teléfonos'],
  ['serv30', 'Traducción simultánea'],
  ['serv31', 'Proveedores'],
  ['serv32', 'Organización de exposiciones'],
  ['serv33', 'Organización de convenciones'],
  ['serv34', 'Oficinas para comité organizador'],
  ['serv35', 'Equipo de cómputo'],
]
const PARK_PAYMENTS = [
  ['tc01', 'American Express'],
  ['tc02', 'Visa'],
  ['tc03', 'Master Card'],
  ['tc04', 'Efectivo'],
  ['tc05', 'Cheque de Viajero'],
  ['tc06', 'Otra'],
]

function ParquesStep({ onContinue, onBack }) {
  const [data, setData] = useState(null)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    apiFetch('/api/form/parques', { signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(); return result })
      .then((result) => setData(result.data))
      .catch((error) => { if (error.name !== 'AbortError') setMessage(safeErrorMessage(error, 'No fue posible cargar el formulario de espacios turísticos.')) })
    return () => controller.abort()
  }, [])
  const update = (name, value) => setData((current) => ({ ...current, [name]: value }))
  const field = (name) => ({ value: data[name] ?? '', onChange: (event) => update(name, event.target.value) })
  const checkbox = ([name, label]) => <label className="lodging-option" key={name}><input type="checkbox" checked={Boolean(Number(data[name]))} onChange={(event) => update(name, Number(event.target.checked))} /><span>{label}</span></label>
  const hasChecked = (options) => options.some(([name]) => Number(data[name]) === 1)
  const save = async (form) => {
    if (form && !form.reportValidity()) return
    if (!hasChecked(PARK_SERVICES)) { setMessage('Selecciona al menos un servicio adicional.'); return }
    if (!hasChecked(PARK_PAYMENTS) && !String(data.otra_tc || '').trim()) { setMessage('Selecciona o captura al menos una forma de pago.'); return }
    setSaving(true); setMessage('')
    try {
      const response = await apiFetch('/api/form/parques', { method: 'PUT', headers: { 'content-type': 'application/json', 'X-CSRF-Token': readCsrfToken() }, body: JSON.stringify(data) })
      await response.json()
      if (!response.ok) throw new Error()
      onContinue()
    } catch (error) {
      setMessage(safeErrorMessage(error, 'No fue posible guardar el formulario de espacios turísticos.'))
    } finally { setSaving(false) }
  }
  if (!data) return <div className="form-loading">{message || 'Cargando formulario de espacios turísticos…'}</div>
  return <div className="general-form parks-form">
    <div className="technical-nav"><button type="button" onClick={onBack}>← Anterior</button><button type="button" onClick={onContinue}>Siguiente →</button></div>
    <div className="legal-intro"><div><span className="eyebrow">Paso en curso</span><strong>80% completado</strong></div><p>Captura la capacidad, los servicios adicionales y las formas de pago del establecimiento.</p></div>
    <FormSection icon="🎡" title="Empresas Operadoras de Espacios Turísticos">
      <div className="general-grid"><label>Capacidad máxima del lugar *<input {...field('capacidad')} maxLength="10" required placeholder="Ej. 5000" /></label></div>
    </FormSection>
    <FormSection icon="✓" title="Servicios Adicionales"><p className="section-instruction">Selecciona al menos un servicio.</p><div className="lodging-options">{PARK_SERVICES.map(checkbox)}</div></FormSection>
    <FormSection icon="💳" title="Formas de Pago"><div className="lodging-options">{PARK_PAYMENTS.map(checkbox)}</div><div className="general-grid"><label className="wide">Otra, ¿Cuál?<input {...field('otra_tc')} maxLength="120" /></label></div></FormSection>
    {message && <p className="general-message" role="status">{message}</p>}
    <button className="save-general" type="button" disabled={saving} onClick={(event) => save(event.currentTarget.form)}>{saving ? 'Guardando espacios turísticos…' : 'Guardar y continuar'} <span>→</span></button>
  </div>
}

const TOUR_OPERATOR_SHIFTS = [
  ['hora01', 'Matutino'],
  ['hora02', 'Vespertino'],
  ['hora03', 'Diurno'],
  ['hora04', 'Nocturno'],
]

function AuxTuristicoStep({ onContinue, onBack }) {
  const [data, setData] = useState(null)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    apiFetch('/api/form/auxturistico', { signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(); return result })
      .then((result) => setData(result.data))
      .catch((error) => { if (error.name !== 'AbortError') setMessage(safeErrorMessage(error, 'No fue posible cargar el formulario de operador turístico.')) })
    return () => controller.abort()
  }, [])
  const update = (name, value) => setData((current) => ({ ...current, [name]: value }))
  const checkbox = ([name, label]) => <label className="lodging-option" key={name}><input type="checkbox" checked={Boolean(Number(data[name]))} onChange={(event) => update(name, Number(event.target.checked))} /><span>{label}</span></label>
  const save = async (form) => {
    if (form && !form.reportValidity()) return
    if (!TOUR_OPERATOR_SHIFTS.some(([name]) => Number(data[name]) === 1)) { setMessage('Selecciona al menos un turno de operación.'); return }
    setSaving(true); setMessage('')
    try {
      const response = await apiFetch('/api/form/auxturistico', { method: 'PUT', headers: { 'content-type': 'application/json', 'X-CSRF-Token': readCsrfToken() }, body: JSON.stringify(data) })
      await response.json()
      if (!response.ok) throw new Error()
      onContinue()
    } catch (error) {
      setMessage(safeErrorMessage(error, 'No fue posible guardar el formulario de operador turístico.'))
    } finally { setSaving(false) }
  }
  if (!data) return <div className="form-loading">{message || 'Cargando formulario de operador turístico…'}</div>
  return <div className="general-form tour-operator-form">
    <div className="technical-nav"><button type="button" onClick={onBack}>← Anterior</button><button type="button" onClick={onContinue}>Siguiente →</button></div>
    <div className="legal-intro"><div><span className="eyebrow">Paso en curso</span><strong>80% completado</strong></div><p>Indica los turnos y el horario en que opera el establecimiento.</p></div>
    <FormSection icon="🧭" title="Operador Turístico">
      <p className="section-instruction">Selecciona al menos un turno de operación.</p>
      <div className="lodging-options">{TOUR_OPERATOR_SHIFTS.map(checkbox)}</div>
      <div className="general-grid"><label className="wide">Indicar el horario *<input value={data.horario ?? ''} onChange={(event) => update('horario', event.target.value)} maxLength="120" required placeholder="Ej. Lunes a domingo de 09:00 a 18:00" /></label></div>
    </FormSection>
    {message && <p className="general-message" role="status">{message}</p>}
    <button className="save-general" type="button" disabled={saving} onClick={(event) => save(event.currentTarget.form)}>{saving ? 'Guardando operador turístico…' : 'Guardar y continuar'} <span>→</span></button>
  </div>
}

const WATER_PARK_SCHEDULES = [['hor_mat', 'Matutino'], ['hor_vesp', 'Vespertino'], ['hor_diur', 'Diurno']]
const WATER_PARK_SERVICES = [
  ['serv01', 'Lago artificial'], ['serv02', 'Lago natural'], ['serv03', 'Aguas termales'],
  ['serv04', 'Albercas de olas'], ['serv05', 'Personal salvavidas'], ['serv06', 'Toboganes'],
  ['serv07', 'Chapoteaderos'], ['serv08', 'Tren escénico'], ['serv09', 'Áreas verdes'],
  ['serv10', 'Regaderas'], ['serv11', 'Cafetería'], ['serv12', 'Área de asadores'],
  ['serv13', 'Vestidores'], ['serv14', 'Sanitarios'], ['serv15', 'Área de juegos infantiles'],
  ['serv16', 'Equipo de contingencias'], ['serv17', 'Aplicación de mascarillas'], ['serv18', 'Masajes'],
  ['serv19', 'Fuentes de sodas'], ['serv20', 'Restaurante'], ['serv21', 'Tienda de souvenirs'],
  ['serv22', 'Boutique'], ['serv23', 'Bar'], ['serv24', 'Albercas privadas'],
  ['serv25', 'Servicio médico'], ['serv26', 'Estacionamiento'], ['serv27', 'Hotel'],
  ['serv28', 'Villas'], ['serv29', 'Cabañas'], ['serv30', 'Bungalows'],
  ['serv31', 'Área de acampar'], ['serv32', 'Área para eventos'], ['serv33', 'Lavandería y tintorería'],
  ['serv34', 'Spa'], ['serv35', 'Palapas'], ['serv36', 'Temazcal'],
]
const WATER_PARK_PAYMENTS = [
  ['tc01', 'American Express'], ['tc02', 'Visa'], ['tc03', 'Master Card'],
  ['tc04', 'Efectivo'], ['tc05', 'Cheque de Viajero'], ['tc06', 'Otra'],
]

function BalneariosStep({ onContinue, onBack }) {
  const [data, setData] = useState(null)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    apiFetch('/api/form/balnearios', { signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(); return result })
      .then((result) => setData(result.data))
      .catch((error) => { if (error.name !== 'AbortError') setMessage(safeErrorMessage(error, 'No fue posible cargar el formulario de balnearios.')) })
    return () => controller.abort()
  }, [])
  const update = (name, value) => setData((current) => ({ ...current, [name]: value }))
  const field = (name) => ({ value: data[name] ?? '', onChange: (event) => update(name, event.target.value) })
  const checkbox = ([name, label]) => <label className="lodging-option" key={name}><input type="checkbox" checked={Boolean(Number(data[name]))} onChange={(event) => update(name, Number(event.target.checked))} /><span>{label}</span></label>
  const hasChecked = (options) => options.some(([name]) => Number(data[name]) === 1)
  const save = async (form) => {
    if (form && !form.reportValidity()) return
    if (!hasChecked(WATER_PARK_SCHEDULES)) { setMessage('Selecciona al menos un horario.'); return }
    if (!hasChecked(WATER_PARK_SERVICES) && !String(data.serv_otro || '').trim()) { setMessage('Selecciona o captura al menos un servicio.'); return }
    if (!hasChecked(WATER_PARK_PAYMENTS) && !String(data.otra_tc || '').trim()) { setMessage('Selecciona o captura al menos una forma de pago.'); return }
    setSaving(true); setMessage('')
    try {
      const response = await apiFetch('/api/form/balnearios', { method: 'PUT', headers: { 'content-type': 'application/json', 'X-CSRF-Token': readCsrfToken() }, body: JSON.stringify(data) })
      await response.json()
      if (!response.ok) throw new Error()
      onContinue()
    } catch (error) {
      setMessage(safeErrorMessage(error, 'No fue posible guardar el formulario de balnearios.'))
    } finally { setSaving(false) }
  }
  if (!data) return <div className="form-loading">{message || 'Cargando formulario de balnearios…'}</div>
  return <div className="general-form water-park-form">
    <div className="technical-nav"><button type="button" onClick={onBack}>← Anterior</button><button type="button" onClick={onContinue}>Siguiente →</button></div>
    <div className="legal-intro"><div><span className="eyebrow">Paso en curso</span><strong>80% completado</strong></div><p>Captura los horarios, instalaciones, promoción y servicios del establecimiento.</p></div>
    <FormSection icon="🌊" title="Balnearios y/o Parques Acuáticos">
      <p className="section-instruction">Selecciona al menos un horario.</p><div className="lodging-options">{WATER_PARK_SCHEDULES.map(checkbox)}</div>
      <div className="general-grid">
        <label>Capacidad máxima del lugar *<input {...field('capacidad')} inputMode="numeric" maxLength="10" required /></label>
        <label>Número de Albercas *<input {...field('alberca')} inputMode="numeric" maxLength="10" required /></label>
        <label>Número de Chapoteaderos *<input {...field('chapoteadero')} inputMode="numeric" maxLength="10" required /></label>
        <label>Número de Toboganes *<input {...field('tobogan')} inputMode="numeric" maxLength="10" required /></label>
        <label>Número de Cajones de Estacionamiento *<input {...field('estacionamiento')} inputMode="numeric" maxLength="10" required /></label>
        <label>Apertura al Público *<input {...field('apertura')} maxLength="15" required placeholder="Ej. 09:00" /></label>
      </div>
    </FormSection>
    <FormSection icon="📣" title="Promoción y Publicidad"><div className="general-grid"><label className="wide">Mencionar el material promocional que manejan *<textarea {...field('material')} maxLength="5000" rows="4" required /></label><label className="wide">Mencionar los medios de publicidad que manejan *<textarea {...field('medios')} maxLength="5000" rows="4" required /></label></div></FormSection>
    <FormSection icon="🏊" title="Servicios"><div className="lodging-options">{WATER_PARK_SERVICES.map(checkbox)}</div><div className="general-grid"><label className="wide">Otros Servicios<textarea {...field('serv_otro')} maxLength="5000" rows="3" /></label></div></FormSection>
    <FormSection icon="💳" title="Formas de Pago"><div className="lodging-options">{WATER_PARK_PAYMENTS.map(checkbox)}</div><div className="general-grid"><label className="wide">Otra, ¿Cuál?<input {...field('otra_tc')} maxLength="120" /></label></div></FormSection>
    {message && <p className="general-message" role="status">{message}</p>}
    <button className="save-general" type="button" disabled={saving} onClick={(event) => save(event.currentTarget.form)}>{saving ? 'Guardando balneario…' : 'Guardar y continuar'} <span>→</span></button>
  </div>
}

const TRAINING_SERVICES = [
  ['serv01', 'Registro estatal'], ['serv02', 'Registro federal'], ['serv03', 'Sin registro'],
  ['serv04', 'Autónoma'], ['serv05', 'Pública'], ['serv06', 'Privada'],
  ['serv07', 'Postgrados'], ['serv08', 'Registro STPS'], ['serv09', 'Instructor independiente'],
  ['serv10', 'Instructor habilitado'], ['serv11', 'Institución capacitadora'], ['serv12', 'Vinculación escuela-empresa'],
  ['serv13', 'Programa de becas'], ['serv14', 'Intercambio escolar'], ['serv15', 'Talleres especializados'],
  ['serv16', 'Idiomas'],
]
const TRAINING_PAYMENTS = [
  ['tc01', 'American Express'], ['tc02', 'Visa'], ['tc03', 'Master Card'],
  ['tc06', 'Efectivo'], ['tc04', 'Cheque de Viajero'], ['tc05', 'Otra'],
]

function CapacitacionStep({ onContinue, onBack }) {
  const [data, setData] = useState(null)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    apiFetch('/api/form/capacitacion', { signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(); return result })
      .then((result) => setData(result.data))
      .catch((error) => { if (error.name !== 'AbortError') setMessage(safeErrorMessage(error, 'No fue posible cargar el formulario de capacitación turística.')) })
    return () => controller.abort()
  }, [])
  const update = (name, value) => setData((current) => ({ ...current, [name]: value }))
  const field = (name) => ({ value: data[name] ?? '', onChange: (event) => update(name, event.target.value) })
  const checkbox = ([name, label]) => <label className="lodging-option" key={name}><input type="checkbox" checked={Boolean(Number(data[name]))} onChange={(event) => update(name, Number(event.target.checked))} /><span>{label}</span></label>
  const hasChecked = (options) => options.some(([name]) => Number(data[name]) === 1)
  const save = async (form) => {
    if (form && !form.reportValidity()) return
    if (!hasChecked(TRAINING_SERVICES)) { setMessage('Selecciona al menos un registro, modalidad o servicio.'); return }
    if (!hasChecked(TRAINING_PAYMENTS) && !String(data.otra_tc || '').trim()) { setMessage('Selecciona o captura al menos una forma de pago.'); return }
    setSaving(true); setMessage('')
    try {
      const response = await apiFetch('/api/form/capacitacion', { method: 'PUT', headers: { 'content-type': 'application/json', 'X-CSRF-Token': readCsrfToken() }, body: JSON.stringify(data) })
      await response.json()
      if (!response.ok) throw new Error()
      onContinue()
    } catch (error) {
      setMessage(safeErrorMessage(error, 'No fue posible guardar el formulario de capacitación turística.'))
    } finally { setSaving(false) }
  }
  if (!data) return <div className="form-loading">{message || 'Cargando formulario de capacitación turística…'}</div>
  return <div className="general-form training-form">
    <div className="technical-nav"><button type="button" onClick={onBack}>← Anterior</button><button type="button" onClick={onContinue}>Siguiente →</button></div>
    <div className="legal-intro"><div><span className="eyebrow">Paso en curso</span><strong>80% completado</strong></div><p>Captura la información académica, servicios y formas de pago.</p></div>
    <FormSection icon="🎓" title="Capacitación Turística">
      <div className="general-grid">
        <label className="wide">Horario de servicio *<input {...field('horario')} maxLength="120" required placeholder="Ej. Lunes a viernes de 09:00 a 18:00" /></label>
        <label className="wide">Asociaciones a las que pertenece *<textarea {...field('asociaciones')} maxLength="5000" rows="3" required /></label>
        <label className="wide">Certificaciones y/o acreditaciones obtenidas *<textarea {...field('certificaciones')} maxLength="5000" rows="3" required /></label>
        <label className="wide">Matrícula de carreras enfocadas al turismo *<textarea {...field('matricula')} maxLength="5000" rows="3" required /></label>
        <label className="wide">No. de personas que imparten la capacitación en los planteles *<input {...field('nopersonas')} inputMode="numeric" maxLength="10" required /></label>
      </div>
    </FormSection>
    <FormSection icon="📚" title="Registros, Modalidades y Servicios"><p className="section-instruction">Selecciona al menos una opción.</p><div className="lodging-options">{TRAINING_SERVICES.map(checkbox)}</div></FormSection>
    <FormSection icon="💳" title="Formas de Pago"><div className="lodging-options">{TRAINING_PAYMENTS.map(checkbox)}</div><div className="general-grid"><label className="wide">Otra, ¿Cuál?<input {...field('otra_tc')} maxLength="120" /></label></div></FormSection>
    {message && <p className="general-message" role="status">{message}</p>}
    <button className="save-general" type="button" disabled={saving} onClick={(event) => save(event.currentTarget.form)}>{saving ? 'Guardando capacitación…' : 'Guardar y continuar'} <span>→</span></button>
  </div>
}

const SPORT_TYPES = [['pesca', 'Pesca Deportiva'], ['rancho', 'Rancho Cinegético'], ['deporte', 'Deporte'], ['recreacion', 'Recreación']]
const SPORT_SERVICES = [
  'Hotel', 'Restaurante', 'Renta de armas', 'Venta de cartuchos', 'Venta de equipo fotográfico', 'Servicio de transporte', 'Asistente o guía', 'Safari fotográfico',
  'Evaluación física y nutricional', 'Gimnasia', 'Aerobics', 'Piscina cubierta', 'Piscina descubierta', 'Gimnasia acuática', 'Campos de golf', 'Club hípico',
  'Talasoterapia', 'Masaje suizo', 'Masaje reductivo', 'Masaje terapéutico', 'Masaje deportivo', 'Aromaterapia', 'Reflexología', 'Algas', 'Fangos', 'Herbales',
  'Sauna', 'Vapor', 'Jacuzzi', 'Tratamientos faciales', 'Boutique', 'Salón de belleza', 'Cafetería', 'Restaurantes', 'Enfermería', 'Hotel', 'Villas',
  'Cabañas', 'Bungalows', 'Áreas de acampar', 'Servicio a cuartos', 'Áreas para eventos', 'Lavandería y tintorería', 'Bar', 'Entrenadores', 'Otros',
].map((label, index) => [`serv${String(index + 1).padStart(2, '0')}`, label])
const HUNTING_TYPES = [
  'Pato charreteras', 'Pato golondrino', 'Pato chalcuan', 'Pato cuaresmeño', 'Cercetas listas verdes', 'Cerceta café', 'Pato triguero', 'Cerceta alas azules',
  'Pato cabeza roja', 'Pato boludo prieto', 'Pato boludo grande', 'Pato coacoxtle', 'Branta negra o del pacífico', 'Ganso canadiense', 'Pato chillón jorobado',
  'Pato chillón ojos dorados', 'Ganso nevado o ansar azul', 'Ganso ross', 'Pato pichichi', 'Pato phichihuila', 'Gallaereta', 'Grulla gris', 'Mergo caperuza',
  'Negreta alas blancas', 'Negreta de merejada', 'Mergo americano', 'Mergo copetón', 'Pato tepalcate', 'Paloma de collar', 'Paloma morada', 'Paloma montañera',
  'Paloma arroyera o suelera', 'Tordo charretero ganga', 'Codorniz de california', 'Codorniz de douglas', 'Codorniz de gambel', 'Codorniz de yucatán',
  'Codorniz enmascarada o común', 'Codorniz moctezuma o pinta', 'Agachona', 'Agrarista o tordo negro', 'Chachalaca', 'Codorniz listada', 'Zanate cola de bote',
  'Estornino', 'Chanate cabeza amarilla', 'Tepezcuintle', 'Ardilla de harris', 'Agutio guaqueque', 'Armadillo de nueve cintas', 'Tlacuache', 'Coyote',
  'Liebre cola negra', 'Liebre torda', 'Tejón o coatí', 'Mapache', 'Ardilla collie', 'Ardilla nayarita', 'Ardilla cola anallada', 'Ardilla mexicana',
  'Ardilla moteada', 'Ardilla de las rocas', 'Ardilla gris', 'Conejo audubon', 'Conejo del bosque tropical', 'Conejo mexicano', 'Conejo del este',
  'Venado bura de sonora', 'Venado cola blanca texano', 'Borrego de cimarrón', 'Becerrillo', 'Perdiz o tinamu', 'Gato montés', 'Venado temazate rojo',
  'Venado temazate café', 'Guajolote silvestre', 'Pavo ocelado', 'Faisán de collar', 'Puma', 'Venado bura', 'Venado cola blanca', 'Jabalí europeo',
  'Jabalí de collar', 'Jabalí de labios blancos', 'Perdiz o tinamu real', 'Zorra gris',
].map((label, index) => [`caza${String(index + 1).padStart(2, '0')}`, label])
const SPORT_PAYMENTS = [['tc01', 'American Express'], ['tc02', 'Visa'], ['tc03', 'Master Card'], ['tc06', 'Efectivo'], ['tc04', 'Cheque de Viajero'], ['tc05', 'Otra']]

function DeporteStep({ onContinue, onBack }) {
  const [data, setData] = useState(null)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    apiFetch('/api/form/deporte', { signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(); return result })
      .then((result) => setData(result.data))
      .catch((error) => { if (error.name !== 'AbortError') setMessage(safeErrorMessage(error, 'No fue posible cargar el formulario de deporte y recreación.')) })
    return () => controller.abort()
  }, [])
  const update = (name, value) => setData((current) => ({ ...current, [name]: value }))
  const field = (name) => ({ value: data[name] ?? '', onChange: (event) => update(name, event.target.value) })
  const checkbox = ([name, label]) => <label className="lodging-option" key={name}><input type="checkbox" checked={Boolean(Number(data[name]))} onChange={(event) => update(name, Number(event.target.checked))} /><span>{label}</span></label>
  const hasChecked = (options) => options.some(([name]) => Number(data[name]) === 1)
  const save = async (form) => {
    if (form && !form.reportValidity()) return
    if (!hasChecked(SPORT_TYPES)) { setMessage('Selecciona al menos una modalidad de actividad.'); return }
    if (!hasChecked(SPORT_SERVICES) && !String(data.otrostxt || '').trim()) { setMessage('Selecciona o captura al menos un servicio.'); return }
    if (!hasChecked(SPORT_PAYMENTS) && !String(data.otra_tc || '').trim()) { setMessage('Selecciona o captura al menos una forma de pago.'); return }
    setSaving(true); setMessage('')
    try {
      const response = await apiFetch('/api/form/deporte', { method: 'PUT', headers: { 'content-type': 'application/json', 'X-CSRF-Token': readCsrfToken() }, body: JSON.stringify(data) })
      await response.json()
      if (!response.ok) throw new Error()
      onContinue()
    } catch (error) { setMessage(safeErrorMessage(error, 'No fue posible guardar el formulario de deporte y recreación.')) }
    finally { setSaving(false) }
  }
  if (!data) return <div className="form-loading">{message || 'Cargando formulario de deporte y recreación…'}</div>
  return <div className="general-form sport-form">
    <div className="technical-nav"><button type="button" onClick={onBack}>← Anterior</button><button type="button" onClick={onContinue}>Siguiente →</button></div>
    <div className="legal-intro"><div><span className="eyebrow">Paso en curso</span><strong>80% completado</strong></div><p>Captura las actividades, servicios y especies relacionadas con el establecimiento.</p></div>
    <FormSection icon="🏃" title="Deporte y Recreación"><p className="section-instruction">Selecciona al menos una modalidad.</p><div className="lodging-options">{SPORT_TYPES.map(checkbox)}</div><div className="general-grid"><label className="wide">Detallar la Actividad *<textarea {...field('detalle')} maxLength="5000" rows="4" required /></label><label>Superficie (hectáreas) *<input {...field('superficie')} inputMode="decimal" maxLength="10" required /></label><label>No. de personas que imparten la capacitación en los planteles *<input {...field('nopersonas')} inputMode="numeric" maxLength="10" required /></label></div></FormSection>
    <FormSection icon="🏅" title="Servicios"><div className="lodging-options">{SPORT_SERVICES.map(checkbox)}</div><div className="general-grid"><label className="wide">Otro, ¿Cuál?<textarea {...field('otrostxt')} maxLength="5000" rows="3" /></label></div></FormSection>
    <FormSection icon="🦆" title="Tipos de Caza"><p className="section-instruction">Selecciona las especies que correspondan.</p><div className="lodging-options">{HUNTING_TYPES.map(checkbox)}</div></FormSection>
    <FormSection icon="💳" title="Formas de Pago"><div className="lodging-options">{SPORT_PAYMENTS.map(checkbox)}</div><div className="general-grid"><label className="wide">Otra, ¿Cuál?<input {...field('otra_tc')} maxLength="120" /></label></div></FormSection>
    {message && <p className="general-message" role="status">{message}</p>}
    <button className="save-general" type="button" disabled={saving} onClick={(event) => save(event.currentTarget.form)}>{saving ? 'Guardando deporte y recreación…' : 'Guardar y continuar'} <span>→</span></button>
  </div>
}

const SPA_SERVICES = [
  'Evaluación Física y Nutricional', 'Gimnasia', 'Aerobics', 'Entrenadores', 'Piscina Cubierta', 'Piscina Descubierta', 'Gimnasia Acuática',
  'Campos de Golf', 'Club Hípico', 'Talasoterapia', 'Masaje Suizo', 'Masaje Reductivo', 'Tienda de Souvenirs', 'Masaje Terapéutico',
  'Masaje Deportivo', 'Aromaterapia', 'Reflexología', 'Algas', 'Fangos', 'Herbales', 'Sauna', 'Vapor', 'Jacuzzi', 'Tratamientos faciales',
  'Boutique', 'Estacionamiento', 'Salón de belleza', 'Cafetería', 'Restaurantes', 'Enfermería', 'Hotel', 'Villas', 'Cabañas', 'Bungalows',
  'Áreas de acampar', 'Servicio a cuartos', 'Áreas para eventos', 'Lavandería y tintorería', 'Temazcal', 'Bar', 'Otros',
].map((label, index) => [`serv${String(index + 1).padStart(2, '0')}`, label])
const SPA_PAYMENTS = [['tc01', 'American Express'], ['tc02', 'Visa'], ['tc03', 'Master Card'], ['tc04', 'Efectivo'], ['tc05', 'Cheque de Viajero'], ['tc06', 'Otra']]

function SpaStep({ onContinue, onBack }) {
  const [data, setData] = useState(null)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    apiFetch('/api/form/spa', { signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(); return result })
      .then((result) => setData(result.data))
      .catch((error) => { if (error.name !== 'AbortError') setMessage(safeErrorMessage(error, 'No fue posible cargar el formulario de SPA.')) })
    return () => controller.abort()
  }, [])
  const update = (name, value) => setData((current) => ({ ...current, [name]: value }))
  const field = (name) => ({ value: data[name] ?? '', onChange: (event) => update(name, event.target.value) })
  const checkbox = ([name, label]) => <label className="lodging-option" key={name}><input type="checkbox" checked={Boolean(Number(data[name]))} onChange={(event) => update(name, Number(event.target.checked))} /><span>{label}</span></label>
  const hasChecked = (options) => options.some(([name]) => Number(data[name]) === 1)
  const save = async (form) => {
    if (form && !form.reportValidity()) return
    if (!hasChecked(SPA_SERVICES) && !String(data.serv_otro || '').trim()) { setMessage('Selecciona o captura al menos un servicio.'); return }
    if (!hasChecked(SPA_PAYMENTS) && !String(data.otra_tc || '').trim()) { setMessage('Selecciona o captura al menos una forma de pago.'); return }
    setSaving(true); setMessage('')
    try {
      const response = await apiFetch('/api/form/spa', { method: 'PUT', headers: { 'content-type': 'application/json', 'X-CSRF-Token': readCsrfToken() }, body: JSON.stringify(data) })
      await response.json()
      if (!response.ok) throw new Error()
      onContinue()
    } catch (error) { setMessage(safeErrorMessage(error, 'No fue posible guardar el formulario de SPA.')) }
    finally { setSaving(false) }
  }
  if (!data) return <div className="form-loading">{message || 'Cargando formulario de SPA…'}</div>
  return <div className="general-form spa-form">
    <div className="technical-nav"><button type="button" onClick={onBack}>← Anterior</button><button type="button" onClick={onContinue}>Siguiente →</button></div>
    <div className="legal-intro"><div><span className="eyebrow">Paso en curso</span><strong>80% completado</strong></div><p>Captura el horario, los servicios de bienestar y las formas de pago.</p></div>
    <FormSection icon="🧖" title="Centro de Bienestar / SPA"><div className="general-grid"><label className="wide">Horario de servicio *<input {...field('horario')} maxLength="120" required placeholder="Ej. Lunes a domingo de 09:00 a 20:00" /></label></div></FormSection>
    <FormSection icon="✨" title="Servicios"><p className="section-instruction">Selecciona al menos un servicio.</p><div className="lodging-options">{SPA_SERVICES.map(checkbox)}</div><div className="general-grid"><label className="wide">Otro, ¿Cuál?<textarea {...field('serv_otro')} maxLength="5000" rows="3" /></label></div></FormSection>
    <FormSection icon="💳" title="Formas de Pago"><div className="lodging-options">{SPA_PAYMENTS.map(checkbox)}</div><div className="general-grid"><label className="wide">Otra, ¿Cuál?<input {...field('otra_tc')} maxLength="120" /></label></div></FormSection>
    {message && <p className="general-message" role="status">{message}</p>}
    <button className="save-general" type="button" disabled={saving} onClick={(event) => save(event.currentTarget.form)}>{saving ? 'Guardando SPA…' : 'Guardar y continuar'} <span>→</span></button>
  </div>
}

const VENUE_SERVICES = [
  'Agencia de viajes', 'Jardines', 'Zona de carga y descarga', 'Área de Registro', 'Restaurante', 'Cafetería', 'Arrendadora de auto',
  'Asesoría financiera', 'Centro de negocios', 'Centro de servicios', 'Edecanes', 'Equipo audiovisual', 'Equipo de Sonido', 'Estacionamiento',
  'Fax', 'Florería', 'Guía de turismo', 'Colgado de lonas y manta', 'Mobiliario de montaje', 'Montaje de stands', 'Oficinas administrativas',
  'Renta de bodegas', 'Renta de taquillas', 'Sanitarios', 'Servicio médico', 'Guardería', 'Servicio de taxis', 'Tabaquería', 'Teléfonos',
  'Traducción simultánea', 'Proveedores', 'Organización de exposiciones', 'Organización de convenciones', 'Oficinas para comité organizador', 'Equipo de cómputo',
].map((label, index) => [`serv${String(index + 1).padStart(2, '0')}`, label])
const VENUE_PAYMENTS = [['tc01', 'American Express'], ['tc02', 'Visa'], ['tc03', 'Master Card'], ['tc06', 'Efectivo'], ['tc04', 'Cheque de Viajero'], ['tc05', 'Otra']]

function RecintoStep({ onContinue, onBack }) {
  const [data, setData] = useState(null)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    apiFetch('/api/form/recinto', { signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(); return result })
      .then((result) => setData(result.data))
      .catch((error) => { if (error.name !== 'AbortError') setMessage(safeErrorMessage(error, 'No fue posible cargar el formulario de recintos.')) })
    return () => controller.abort()
  }, [])
  const update = (name, value) => setData((current) => ({ ...current, [name]: value }))
  const field = (name) => ({ value: data[name] ?? '', onChange: (event) => update(name, event.target.value) })
  const checkbox = ([name, label]) => <label className="lodging-option" key={name}><input type="checkbox" checked={Boolean(Number(data[name]))} onChange={(event) => update(name, Number(event.target.checked))} /><span>{label}</span></label>
  const hasChecked = (options) => options.some(([name]) => Number(data[name]) === 1)
  const save = async (form) => {
    if (form && !form.reportValidity()) return
    if (!hasChecked(VENUE_SERVICES)) { setMessage('Selecciona al menos un servicio.'); return }
    if (!hasChecked(VENUE_PAYMENTS) && !String(data.otra_tc || '').trim()) { setMessage('Selecciona o captura al menos una forma de pago.'); return }
    setSaving(true); setMessage('')
    try {
      const response = await apiFetch('/api/form/recinto', { method: 'PUT', headers: { 'content-type': 'application/json', 'X-CSRF-Token': readCsrfToken() }, body: JSON.stringify(data) })
      await response.json()
      if (!response.ok) throw new Error()
      onContinue()
    } catch (error) { setMessage(safeErrorMessage(error, 'No fue posible guardar el formulario de recintos.')) }
    finally { setSaving(false) }
  }
  if (!data) return <div className="form-loading">{message || 'Cargando formulario de recintos…'}</div>
  return <div className="general-form venue-form">
    <div className="technical-nav"><button type="button" onClick={onBack}>← Anterior</button><button type="button" onClick={onContinue}>Siguiente →</button></div>
    <div className="legal-intro"><div><span className="eyebrow">Paso en curso</span><strong>80% completado</strong></div><p>Captura la modalidad, horario, servicios y formas de pago del recinto.</p></div>
    <FormSection icon="🎙️" title="Recintos y Salones para Eventos"><div className="general-grid"><label>Horario de servicio *<input {...field('horario')} maxLength="120" required /></label><label>Modalidad *<select {...field('modalidad')} required><option value="">Elegir opción…</option><option value="Centros de Congresos y Exposiciones">Centros de Congresos y Exposiciones</option><option value="Congresos y Exposiciones en Hotel">Congresos y Exposiciones en Hotel</option></select></label></div></FormSection>
    <FormSection icon="✓" title="Servicios"><p className="section-instruction">Selecciona al menos un servicio.</p><div className="lodging-options">{VENUE_SERVICES.map(checkbox)}</div></FormSection>
    <FormSection icon="💳" title="Formas de Pago"><div className="lodging-options">{VENUE_PAYMENTS.map(checkbox)}</div><div className="general-grid"><label className="wide">Otra, ¿Cuál?<input {...field('otra_tc')} maxLength="120" /></label></div></FormSection>
    {message && <p className="general-message" role="status">{message}</p>}
    <button className="save-general" type="button" disabled={saving} onClick={(event) => save(event.currentTarget.form)}>{saving ? 'Guardando recinto…' : 'Guardar y continuar'} <span>→</span></button>
  </div>
}

const DIGITAL_PLATFORMS = [['airbnb', 'AirBnB'], ['kayak', 'Kayak'], ['booking', 'Booking'], ['tripadvisor', 'Tripadvisor'], ['trivago', 'Trivago'], ['otrap', 'Otra']]
const DIGITAL_ROOM_SERVICES = [['cocineta', 'Cocineta'], ['tv', 'Televisión'], ['cajafuerte', 'Caja Fuerte'], ['cocinetaparcial', 'Cocineta Parcial'], ['cable', 'Cable'], ['jacuzzi', 'Jacuzzi'], ['aireacondicionado', 'Aire Acondicionado'], ['telefono', 'Teléfono'], ['aguacaliente', 'Agua Caliente'], ['ventilador', 'Ventilador'], ['minibar', 'Minibar']]
const DIGITAL_COMMON_SERVICES = [
  ['cafeteria', 'Cafetería'], ['bar', 'Bar'], ['acceso', 'Acceso para personas con capacidades diferentes'], ['restaurante', 'Restaurante'], ['boutique', 'Boutique'], ['agencia', 'Agencia de Viajes'], ['cocinaindustrial', 'Cocina Industrial'], ['regalo', 'Regalos'], ['spa', 'Spa'], ['banquete', 'Banquetes y Convenciones'], ['tabaqueria', 'Tabaquería'], ['room', 'Room Service'], ['salon', 'Salones de Eventos'], ['internet', 'Internet'], ['floreria', 'Florería'], ['alberca', 'Alberca'], ['sala', 'Sala de Belleza y Peluquería'], ['arrendadora', 'Arrendadora de Vehículos'], ['chapoteadero', 'Chapoteadero'], ['gimnasio', 'Gimnasio'], ['golf', 'Campo de Golf'], ['area', 'Áreas Verdes'], ['lavanderia', 'Lavandería'], ['tenis', 'Cancha de Tenis'], ['juego', 'Juegos Infantiles'], ['tintoreria', 'Tintorería'], ['ejecutivo', 'Centro Ejecutivo'], ['actividad', 'Actividades Recreativas'], ['elevador', 'Elevador'], ['estacionamiento', 'Estacionamiento'],
]
const DIGITAL_CERTIFICATIONS = [['h', 'Distintivo H'], ['m', 'Distintivo M'], ['tesoros', 'Tesoros de Guanajuato'], ['iso', 'ISO'], ['puntolimpio', 'Punto Limpio'], ['anfitrion', 'Gran Anfitrión'], ['estandares', 'Estándares de Competencia Laboral'], ['otro', 'Otra']]

function HospedajeDigitalStep({ onContinue, onBack }) {
  const [data, setData] = useState(null)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    apiFetch('/api/form/hospedaje-digital', { signal: controller.signal }).then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(); return result }).then((result) => setData(result.data)).catch((error) => { if (error.name !== 'AbortError') setMessage(safeErrorMessage(error, 'No fue posible cargar el formulario de hospedaje digital.')) })
    return () => controller.abort()
  }, [])
  const update = (name, value) => setData((current) => ({ ...current, [name]: value }))
  const field = (name) => ({ value: data[name] ?? '', onChange: (event) => update(name, event.target.value) })
  const checkbox = ([name, label]) => <label className="lodging-option" key={name}><input type="checkbox" checked={Boolean(Number(data[name]))} onChange={(event) => update(name, Number(event.target.checked))} /><span>{label}</span></label>
  const save = async (form) => {
    if (form && !form.reportValidity()) return
    if (!DIGITAL_PLATFORMS.some(([name]) => Number(data[name]) === 1)) { setMessage('Selecciona al menos una plataforma digital.'); return }
    setSaving(true); setMessage('')
    try {
      const response = await apiFetch('/api/form/hospedaje-digital', { method: 'PUT', headers: { 'content-type': 'application/json', 'X-CSRF-Token': readCsrfToken() }, body: JSON.stringify(data) })
      await response.json(); if (!response.ok) throw new Error(); onContinue()
    } catch (error) { setMessage(safeErrorMessage(error, 'No fue posible guardar el formulario de hospedaje digital.')) }
    finally { setSaving(false) }
  }
  if (!data) return <div className="form-loading">{message || 'Cargando formulario de hospedaje digital…'}</div>
  return <div className="general-form digital-lodging-form">
    <div className="technical-nav"><button type="button" onClick={onBack}>← Anterior</button><button type="button" onClick={onContinue}>Siguiente →</button></div>
    <div className="legal-intro"><div><span className="eyebrow">Paso en curso</span><strong>80% completado</strong></div><p>Captura la oferta de alojamiento, plataformas, servicios y seguridad.</p></div>
    <FormSection icon="🏠" title="Hospedaje mediante Plataformas Digitales"><div className="general-grid"><label>Tipo de Alojamiento *<select {...field('categoria')} required><option value="">Elegir opción…</option><option value="1">Alojamiento completo</option><option value="2">Habitación privada</option><option value="3">Habitación compartida</option></select></label><label>Alojamiento que se ofrece *<input {...field('establecimiento')} maxLength="50" required /></label><label>Número de Habitaciones *<input {...field('cuartos')} type="number" min="1" max="999" required /></label><label>Número de camas que pueden utilizar los huéspedes *<input {...field('pisos')} type="number" min="1" max="99" required /></label></div></FormSection>
    <FormSection icon="📱" title="Plataformas Digitales"><div className="lodging-options">{DIGITAL_PLATFORMS.map(checkbox)}</div><div className="general-grid"><label className="wide">Otra, ¿Cuál?<input {...field('otradigital')} maxLength="50" /></label></div></FormSection>
    <FormSection icon="🛏️" title="Servicios en las Habitaciones"><div className="lodging-options">{DIGITAL_ROOM_SERVICES.map(checkbox)}</div></FormSection>
    <FormSection icon="🏨" title="Servicios Comunes"><div className="lodging-options">{DIGITAL_COMMON_SERVICES.map(checkbox)}</div></FormSection>
    <FormSection icon="🏅" title="Certificaciones"><div className="lodging-options">{DIGITAL_CERTIFICATIONS.map(checkbox)}</div><div className="general-grid"><label className="wide">Otra, ¿Cuál?<input {...field('otracertificacion')} maxLength="50" /></label></div></FormSection>
    <FormSection icon="🚗" title="Estacionamiento y Seguridad"><div className="general-grid"><label>Número de Cajones *<input {...field('nocajon')} type="number" min="0" max="9999" required /></label><label>Tipo de Estacionamiento *<select {...field('tipocajon')} required><option value="">Elegir opción…</option><option value="Interno">Interno</option><option value="Externo">Externo</option></select></label><label>¿Cuenta con seguro de responsabilidad? *<select {...field('seguro')} required><option value="">Elegir opción…</option><option value="0">No</option><option value="1">Sí</option></select></label>{Number(data.seguro) === 1 && <label>¿Cuál aseguradora? *<input {...field('aseguradora')} maxLength="50" required /></label>}<label>¿Cuenta con unidades y espacios para paraderos? *<select {...field('unidad')} required><option value="">Elegir opción…</option><option value="0">No</option><option value="1">Sí</option></select></label></div></FormSection>
    {message && <p className="general-message" role="status">{message}</p>}
    <button className="save-general" type="button" disabled={saving} onClick={(event) => save(event.currentTarget.form)}>{saving ? 'Guardando hospedaje digital…' : 'Guardar y continuar'} <span>→</span></button>
  </div>
}

function StarRating({ name, value, onChange, lowLabel, highLabel }) {
  return <fieldset className="rating-field">
    <legend>{name}</legend>
    <div className="star-rating" role="radiogroup" aria-label={name}>{[5, 4, 3, 2, 1].map((score) => <label key={score} title={`${score} de 5 estrellas`}>
      <input type="radio" name={name} value={score} checked={value === score} onChange={() => onChange(score)} required />
      <span aria-hidden="true">★</span><span className="sr-only">{score} de 5 estrellas</span>
    </label>)}</div>
    <small>1 estrella: {lowLabel} · 5 estrellas: {highLabel}</small>
  </fieldset>
}

function ExperienciaStep({ onBack, onComplete }) {
  const [utility, setUtility] = useState(0)
  const [navigation, setNavigation] = useState(0)
  const [information, setInformation] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const save = async (form) => {
    if (form && !form.reportValidity()) return
    if (!utility || !navigation) { setMessage('Selecciona una calificación en las dos preguntas.'); return }
    setSaving(true); setMessage('')
    try {
      const response = await apiFetch('/api/form/encuesta', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-CSRF-Token': readCsrfToken() },
        body: JSON.stringify({ fue_utilidad: utility, facil_navegacion: navigation, gustaria: information }),
      })
      await response.json()
      if (!response.ok) throw new Error()
      setSubmitted(true)
      onComplete()
    } catch (error) {
      setMessage(safeErrorMessage(error, 'No fue posible guardar la encuesta.'))
    } finally { setSaving(false) }
  }
  return <div className="general-form experience-form">
    <div className="technical-nav"><button type="button" onClick={onBack}>← Anterior</button><button type="button" disabled aria-disabled="true">Último paso</button></div>
    <div className="legal-intro"><div><span className="eyebrow">Paso final</span><strong>100% completado</strong></div><p>Tu respuesta es anónima y nos ayuda a mejorar la experiencia del registro.</p></div>
    <FormSection icon="★" title="Cuéntanos tu experiencia">
      <div className="experience-questions">
        <StarRating name="¿Te fue de utilidad la información?" value={utility} onChange={setUtility} lowLabel="poco útil" highLabel="muy útil" />
        <StarRating name="¿Fue fácil navegar en esta página?" value={navigation} onChange={setNavigation} lowLabel="difícil" highLabel="muy fácil" />
        <label className="experience-comment">3. ¿Qué información te gustaría conocer?<textarea value={information} onChange={(event) => setInformation(event.target.value)} maxLength="2000" rows="5" placeholder="Escribe tu respuesta (opcional)" /><small>{information.length}/2000 caracteres</small></label>
      </div>
    </FormSection>
    {message && <p className="general-message" role="status">{message}</p>}
    <button className="save-general" type="button" disabled={saving || submitted} onClick={(event) => save(event.currentTarget.form)}>{saving ? 'Enviando respuesta…' : submitted ? 'Registro completado' : 'Finalizar registro'} <span>✓</span></button>
  </div>
}

const WIZARD_STEPS = ['Datos generales', 'Datos técnicos', 'Datos legales', 'Documentación gráfica', 'Formulario de Hospedaje', 'Experiencia']

function MyRecordsView({ onBack, onSelect }) {
  const [records, setRecords] = useState(null)
  const [message, setMessage] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    apiFetch('/api/mis-registros', { signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(); return result })
      .then((result) => setRecords(result.data || []))
      .catch((error) => { if (error.name !== 'AbortError') setMessage(safeErrorMessage(error, 'No fue posible cargar tus registros.')) })
    return () => controller.abort()
  }, [])
  const selectRecord = async (record) => {
    if (record.actual) { onBack(); return }
    try {
      const response = await apiFetch(`/api/mis-registros/${encodeURIComponent(record.clave)}/seleccionar`, { method: 'POST', headers: { 'X-CSRF-Token': readCsrfToken() } })
      const result = await response.json()
      if (!response.ok) throw new Error()
      onSelect(result.data)
    } catch (error) { setMessage(safeErrorMessage(error, 'No fue posible seleccionar el establecimiento.')) }
  }
  const showFormat = (record) => Swal.fire({
    icon: 'info', title: 'Formato del establecimiento',
    text: `El formato de ${record.nombre_comercial || record.clave} se incorporará en una siguiente etapa.`,
    confirmButtonColor: '#0878b9',
  })
  const deleteRecord = async (record) => {
    const confirmation = await Swal.fire({
      icon: 'warning', title: '¿Eliminar este registro?',
      text: 'Se desactivará el establecimiento, pero su expediente no se borrará físicamente.',
      showCancelButton: true, confirmButtonText: 'Sí, eliminar', cancelButtonText: 'Cancelar',
      confirmButtonColor: '#c23b47', cancelButtonColor: '#617887',
    })
    if (!confirmation.isConfirmed) return
    try {
      const response = await apiFetch(`/api/mis-registros/${encodeURIComponent(record.clave)}`, { method: 'DELETE', headers: { 'X-CSRF-Token': readCsrfToken() } })
      await response.json()
      if (!response.ok) throw new Error()
      setRecords((current) => current.filter((item) => item.clave !== record.clave))
      await Swal.fire({ icon: 'success', title: 'Registro eliminado', text: 'El registro se desactivó correctamente.', confirmButtonColor: '#0878b9' })
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'No fue posible eliminarlo', text: safeErrorMessage(error, 'No fue posible eliminar el registro.'), confirmButtonColor: '#0878b9' })
    }
  }
  return <div className="records-page-shell">
    <section className="records-page" aria-labelledby="records-title">
      <header><div><span className="step-pill">Mi cuenta</span><h1 id="records-title">Mis registros</h1><p>Administra los establecimientos asociados a tu correo.</p></div><button className="records-back-button" type="button" onClick={onBack}>← Volver al formulario</button></header>
      {message && <p className="general-message" role="status">{message}</p>}
      {!records ? <div className="form-loading">Cargando establecimientos…</div> : <div className="records-list">{records.map((record) => <article className={record.actual ? 'current' : ''} key={record.clave}>
        <div className="record-main"><span className="record-icon">{GIRO_ICONS[record.id_giro] || '📍'}</span><div><strong>{record.nombre_comercial || 'Establecimiento sin nombre'}</strong><span>{record.clave} · {cleanCatalogText(record.giro) || 'Giro sin especificar'}</span><small>{record.municipio || 'Municipio sin especificar'} · {record.porcentaje_registro || 0}% completado</small></div>{record.actual && <b>Actual</b>}</div>
        <div className="record-actions">
          <button type="button" title="Editar establecimiento" aria-label={`Editar ${record.nombre_comercial}`} onClick={() => selectRecord(record)}>✎</button>
          <button type="button" title="Ver formato" aria-label={`Ver formato de ${record.nombre_comercial}`} onClick={() => showFormat(record)}>▤</button>
          <button className="delete" type="button" title="Eliminar registro" aria-label={`Eliminar ${record.nombre_comercial}`} onClick={() => deleteRecord(record)}>🗑</button>
        </div>
      </article>)}</div>}
    </section>
  </div>
}

function AuthenticatedWizard({ user, onLogout, onUserChange }) {
  const [step, setStep] = useState(0)
  const [showRecords, setShowRecords] = useState(false)
  const [showNewRegistration, setShowNewRegistration] = useState(false)
  const giroStepNames = { 2: 'Formulario de Agencia de Viajes', 3: 'Formulario de Guía de Turistas', 4: 'Formulario de Operador de Eventos', 5: 'Formulario de Alimentos y Bebidas', 6: 'Formulario de Campo de Golf', 7: 'Formulario de Arte Popular y Productos', 9: 'Formulario de Arrendamiento de Autos', 10: 'Formulario de Espacios Turísticos', 11: 'Formulario de Operador Turístico', 12: 'Formulario de Balnearios y Parques Acuáticos', 13: 'Formulario de Capacitación Turística', 14: 'Formulario de Deporte y Recreación', 15: 'Formulario de Centro de Bienestar / SPA', 16: 'Formulario de Recintos y Salones para Eventos', 17: 'Formulario de Hospedaje mediante Plataformas Digitales' }
  const skipsGiroForm = Number(user.giro) === 8
  const wizardSteps = skipsGiroForm
    ? WIZARD_STEPS.filter((_, index) => index !== 4)
    : giroStepNames[Number(user.giro)]
      ? WIZARD_STEPS.map((label, index) => index === 4 ? giroStepNames[Number(user.giro)] : label)
      : WIZARD_STEPS
  const experienceStep = skipsGiroForm ? 4 : 5
  const continueWithNewRegistration = async (registration) => {
    const response = await apiFetch(`/api/mis-registros/${encodeURIComponent(registration.clave)}/seleccionar`, { method: 'POST', headers: { 'X-CSRF-Token': readCsrfToken() } })
    const result = await response.json()
    if (!response.ok) throw new Error()
    setShowNewRegistration(false)
    setShowRecords(false)
    setStep(0)
    onUserChange(result.data)
  }

  return <main className="wizard-page">
    <header className="wizard-topbar">
    
         <img  src={logoRet} alt="RET" width="100" />
      <div className="wizard-header-actions"><div className="records-shortcuts"><button className="new-record-button" type="button" onClick={() => setShowNewRegistration(true)}>＋ Nuevo registro</button><button className="my-records-button" type="button" onClick={() => setShowRecords(true)}>Mis registros</button></div><div className="wizard-user"><div><strong>{user.nombre_comercial || user.clave}</strong><span>{user.clave}</span></div><button type="button" onClick={onLogout}>Cerrar sesión</button></div></div>
    </header>
    {showRecords ? <MyRecordsView onBack={() => setShowRecords(false)} onSelect={(selected) => { setShowRecords(false); setStep(0); onUserChange(selected) }} /> : <div className="wizard-layout">
      <aside className="wizard-sidebar">
        <span className="eyebrow">Registro del establecimiento</span>
        <h1>Completa tu información</h1>
        <p>Los cambios pueden organizarse por etapas para facilitar el registro.</p>
        <ol>{wizardSteps.map((label, index) => <li key={label} className={index === step ? 'active' : index < step ? 'complete' : ''}><button type="button" onClick={() => setStep(index)}><span>{index < step ? '✓' : index + 1}</span>{label}</button></li>)}</ol>
      </aside>
      <section className="wizard-card">
        <div className="wizard-progress"><span>Paso {step + 1} de {wizardSteps.length}</span><div><i style={{ width: `${((step + 1) / wizardSteps.length) * 100}%` }} /></div></div>
        <form className="wizard-form" onSubmit={(event) => event.preventDefault()}>
          <h2>{wizardSteps[step]}</h2>
          {step === 0 && <DatosGeneralesStep user={user} onContinue={() => setStep(1)} />}
          {step === 1 && <DatosTecnicosStep onBack={() => setStep(0)} onContinue={() => setStep(2)} />}
          {step === 2 && <DatosLegalesStep onBack={() => setStep(1)} onContinue={() => setStep(3)} />}
          {step === 3 && <DocumentacionGraficaStep onBack={() => setStep(2)} onContinue={() => setStep(4)} />}
          {step === 4 && Number(user.giro) === 1 && <HospedajeStep onBack={() => setStep(3)} onContinue={() => setStep(5)} />}
          {step === 4 && Number(user.giro) === 2 && <AgenciaStep onBack={() => setStep(3)} onContinue={() => setStep(5)} />}
          {step === 4 && Number(user.giro) === 3 && <GuiaStep onBack={() => setStep(3)} onContinue={() => setStep(5)} />}
          {step === 4 && Number(user.giro) === 4 && <PromotoresStep onBack={() => setStep(3)} onContinue={() => setStep(5)} />}
          {step === 4 && Number(user.giro) === 5 && <RestaurantesStep onBack={() => setStep(3)} onContinue={() => setStep(5)} />}
          {step === 4 && Number(user.giro) === 6 && <GolfStep onBack={() => setStep(3)} onContinue={() => setStep(5)} />}
          {step === 4 && Number(user.giro) === 7 && <ArteStep onBack={() => setStep(3)} onContinue={() => setStep(5)} />}
          {step === 4 && Number(user.giro) === 9 && <ArrendadoraStep onBack={() => setStep(3)} onContinue={() => setStep(5)} />}
          {step === 4 && Number(user.giro) === 10 && <ParquesStep onBack={() => setStep(3)} onContinue={() => setStep(5)} />}
          {step === 4 && Number(user.giro) === 11 && <AuxTuristicoStep onBack={() => setStep(3)} onContinue={() => setStep(5)} />}
          {step === 4 && Number(user.giro) === 12 && <BalneariosStep onBack={() => setStep(3)} onContinue={() => setStep(5)} />}
          {step === 4 && Number(user.giro) === 13 && <CapacitacionStep onBack={() => setStep(3)} onContinue={() => setStep(5)} />}
          {step === 4 && Number(user.giro) === 14 && <DeporteStep onBack={() => setStep(3)} onContinue={() => setStep(5)} />}
          {step === 4 && Number(user.giro) === 15 && <SpaStep onBack={() => setStep(3)} onContinue={() => setStep(5)} />}
          {step === 4 && Number(user.giro) === 16 && <RecintoStep onBack={() => setStep(3)} onContinue={() => setStep(5)} />}
          {step === 4 && Number(user.giro) === 17 && <HospedajeDigitalStep onBack={() => setStep(3)} onContinue={() => setStep(5)} />}
          {step === experienceStep && <ExperienciaStep onBack={() => setStep(skipsGiroForm ? 3 : 4)} onComplete={() => setShowRecords(true)} />}
        </form>
      </section>
    </div>}
    {showNewRegistration && <RegistrationModal accountEmail={user.email} onClose={() => setShowNewRegistration(false)} onRegistered={continueWithNewRegistration} />}
  </main>
}

function MapPanel() {
  const [locations, setLocations] = useState([])
  const [giros, setGiros] = useState([])
  const [selectedGiro, setSelectedGiro] = useState('1')
  const [status, setStatus] = useState('loading')
  useEffect(() => {
    const controller = new AbortController()
    apiFetch('/api/giros', { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error(); return response.json() })
      .then(({ data }) => setGiros(Array.isArray(data) ? data : []))
      .catch(() => {})
    return () => controller.abort()
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    apiFetch(`/api/establecimientos?giro=${encodeURIComponent(selectedGiro)}`, {
      signal: controller.signal,
    })
      .then((response) => { if (!response.ok) throw new Error(); return response.json() })
      .then(({ data }) => { setLocations(Array.isArray(data) ? data : []); setStatus('ready') })
      .catch((error) => { if (error.name !== 'AbortError') setStatus('error') })
    return () => controller.abort()
  }, [selectedGiro])

  const changeGiro = (event) => {
    setStatus('loading')
    setLocations([])
    setSelectedGiro(event.target.value)
  }

  return <main className="map-panel">
    <div className="map-header"><div><span className="eyebrow map-eyebrow">Explora la red</span><h2>Una entrada más clara, actual y poderosa para el RET.</h2></div><label className="search-box giro-select"><select value={selectedGiro} onChange={changeGiro} aria-label="Seleccionar giro">{giros.length === 0 && <option value="1">🏨 01. Hospedaje</option>}{giros.map((item) => <option key={item.id_giro} value={item.id_giro}>{GIRO_ICONS[item.id_giro] || '📍'} {cleanCatalogText(item.giro)}</option>)}</select></label></div>
    <div className="map-shell">
      <MapContainer center={DEFAULT_CENTER} zoom={5} className="map">
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <FitMap locations={locations} />
        {locations.map((item, index) => <Marker key={`${item.nombre_comercial}-${item.latitud}-${item.longitud}-${index}`} position={[item.latitud, item.longitud]} icon={LOCATION_ICONS[selectedGiro] || LOCATION_ICONS[1]}><Popup><strong>{GIRO_ICONS[selectedGiro]} {item.nombre_comercial || 'Sin nombre'}</strong><p>{item.descripcion || 'Sin descripción disponible'}</p></Popup></Marker>)}
      </MapContainer>
      <div className={`map-status ${status}`}><span className="pulse-dot" />{status === 'loading' && 'Cargando ubicaciones…'}{status === 'ready' && `${locations.length} ${locations.length === 1 ? 'ubicación' : 'ubicaciones'}`}{status === 'error' && 'No se pudo conectar con el servidor'}</div>
    </div>
  </main>
}

function AdminDashboard({ admin, onLogout }) {
  const [dashboard, setDashboard] = useState(null)
  const [message, setMessage] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [records, setRecords] = useState({ rows: [], total: 0, page: 1, pages: 1, pageSize: 10 })
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [tableLoading, setTableLoading] = useState(true)
  useEffect(() => {
    const controller = new AbortController()
    apiFetch('/api/admin/dashboard', { signal: controller.signal })
      .then((response) => response.json())
      .then((result) => setDashboard(result.data))
      .catch((error) => { if (error.name !== 'AbortError') setMessage(safeErrorMessage(error, 'No fue posible cargar el dashboard.')) })
    return () => controller.abort()
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setTableLoading(true)
      const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize), search, status: statusFilter })
      apiFetch(`/api/admin/tramites?${query}`, { signal: controller.signal })
        .then((response) => response.json())
        .then((result) => setRecords(result.data))
        .catch((error) => { if (error.name !== 'AbortError') setMessage(safeErrorMessage(error, 'No fue posible cargar los trámites.')) })
        .finally(() => { if (!controller.signal.aborted) setTableLoading(false) })
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [page, pageSize, search, statusFilter])
  const metrics = dashboard?.metrics || {}
  const formatNumber = (number) => Number(number || 0).toLocaleString('es-MX')
  const maxGiro = Math.max(...(dashboard?.byGiro || []).map((item) => Number(item.total)), 1)
  const maxMunicipio = Math.max(...(dashboard?.byMunicipio || []).map((item) => Number(item.total)), 1)
  const maxActivity = Math.max(...(dashboard?.activity || []).map((item) => Number(item.total)), 1)
  const metricCards = [
    ['Registros activos', metrics.activos, '◉', 'active'], ['Registros de hoy', metrics.hoy, '+', 'today'],
    ['Pendientes', metrics.pendientes, '◷', 'pending'], ['Concluidos', metrics.concluidos, '✓', 'complete'],
    ['Aprobados', metrics.aprobados, '★', 'approved'], ['Renovaciones', metrics.renovaciones, '↻', 'renewal'],
    ['Vencidos', metrics.vencidos, '!', 'expired'],
  ]
  const quickLinks = [['Pendiente', 'Pendientes', metrics.pendientes], ['Concluido', 'Concluidos', metrics.concluidos], ['Aprobado', 'Aprobados', metrics.aprobados], ['Renovación', 'Renovaciones', metrics.renovaciones]]
  return <main className="admin-dashboard">
    <header className="admin-topbar"><div><img src={logoRet} alt="RET" /><span>Administración RET</span></div><div className="admin-user"><span><strong>{admin.name}</strong><small>{admin.email}</small></span><button type="button" onClick={onLogout}>Cerrar sesión</button></div></header>
    <section className="admin-content">
      <div className="admin-heading"><div><span className="eyebrow">Administración estatal</span><h1>Panel Ejecutivo RET</h1><p>Indicadores y actividad del Registro Estatal de Turismo.</p></div></div>
      {message && <p className="general-message" role="status">{message}</p>}
      {!dashboard ? <div className="form-loading">Cargando indicadores…</div> : <>
        <div className="admin-metrics">
          {metricCards.map(([label, total, icon, kind]) => <article className={`admin-metric ${kind}`} key={label}><i aria-hidden="true">{icon}</i><div><span>{label}</span><strong>{formatNumber(total)}</strong></div></article>)}
        </div>
        <div className="admin-insights">
          <RankingCard title="Registros por giro" items={dashboard.byGiro} maximum={maxGiro} />
          <RankingCard title="Registros por municipio" items={dashboard.byMunicipio} maximum={maxMunicipio} />
        </div>
        <section className="admin-panel admin-activity"><header><span className="eyebrow">Tendencia reciente</span><h2>Actividad de los últimos 7 días</h2></header><div className="activity-chart">{(dashboard.activity || []).map((item) => <div className="activity-day" key={item.date}><strong>{formatNumber(item.total)}</strong><div><i style={{ height: `${Math.max((Number(item.total) / maxActivity) * 100, item.total ? 8 : 2)}%` }} /></div><span>{new Date(`${item.date}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'short' }).replace('.', '')}</span></div>)}</div></section>
        <section className="admin-panel admin-shortcuts"><header><span className="eyebrow">Navegación</span><h2>Accesos rápidos</h2></header><div>{quickLinks.map(([status, label, total]) => <button type="button" className={statusFilter === status ? 'selected' : ''} onClick={() => { setStatusFilter(statusFilter === status ? '' : status); setPage(1); document.getElementById('admin-records')?.scrollIntoView({ behavior: 'smooth' }) }} key={status}><span>{label}</span><strong>{formatNumber(total)}</strong><b aria-hidden="true">→</b></button>)}</div></section>
        <section className="admin-recent" id="admin-records"><header><div><span className="eyebrow">Trámites visibles</span><h2>{statusFilter ? `Registros: ${statusFilter}` : 'Listado de trámites'}</h2></div>{statusFilter && <button className="clear-admin-filter" type="button" onClick={() => { setStatusFilter(''); setPage(1) }}>Ver todos</button>}</header>
          <div className="admin-table-tools"><label>Mostrar <select className="form-select form-select-sm" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }}><option value="10">10</option><option value="25">25</option><option value="50">50</option></select> registros</label><label className="admin-search">Buscar:<input className="form-control form-control-sm" type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Clave, nombre, correo…" /></label></div>
          <div className="admin-table-wrap table-responsive"><table className="table table-striped table-hover align-middle mb-0"><thead className="table-light"><tr><th>Clave RET</th><th>Nombre comercial</th><th>Giro</th><th>Municipio</th><th>Correo</th><th>Fecha de registro</th><th>Estatus</th></tr></thead><tbody>{tableLoading ? <tr><td colSpan="7" className="admin-empty">Cargando registros…</td></tr> : records.rows.map((item) => <tr key={item.clave}><td><strong>{item.clave || '—'}</strong></td><td>{item.nombre_comercial || 'Sin nombre'}</td><td>{cleanCatalogText(item.giro) || 'Sin giro'}</td><td>{item.municipio || 'Sin municipio'}</td><td>{item.correo || '—'}</td><td>{item.fecha_registro ? new Date(item.fecha_registro).toLocaleDateString('es-MX') : '—'}</td><td><span className={`admin-status ${item.estatus?.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')}`}>{item.estatus}</span></td></tr>)}{!tableLoading && records.rows.length === 0 && <tr><td colSpan="7" className="admin-empty">No se encontraron trámites.</td></tr>}</tbody></table></div>
          <footer className="admin-table-footer"><span>Mostrando {records.total ? ((records.page - 1) * records.pageSize) + 1 : 0} a {Math.min(records.page * records.pageSize, records.total)} de {formatNumber(records.total)} registros</span><nav aria-label="Paginación de trámites"><ul className="pagination pagination-sm mb-0"><li className={`page-item ${page <= 1 ? 'disabled' : ''}`}><button className="page-link" type="button" onClick={() => setPage((current) => Math.max(1, current - 1))}>Anterior</button></li>{Array.from({ length: Math.min(5, records.pages) }, (_, index) => { const start = Math.max(1, Math.min(page - 2, records.pages - 4)); const number = start + index; return <li className={`page-item ${number === page ? 'active' : ''}`} key={number}><button className="page-link" type="button" onClick={() => setPage(number)}>{number}</button></li> })}<li className={`page-item ${page >= records.pages ? 'disabled' : ''}`}><button className="page-link" type="button" onClick={() => setPage((current) => Math.min(records.pages, current + 1))}>Siguiente</button></li></ul></nav></footer>
        </section>
      </>}
    </section>
  </main>
}

function RankingCard({ title, items = [], maximum = 1 }) {
  return <section className="admin-panel admin-ranking"><header><span className="eyebrow">Top 6 visibles</span><h2>{title}</h2></header><div>{items.map((item) => <article key={item.label}><div><span title={cleanCatalogText(item.label)}>{cleanCatalogText(item.label)}</span><strong>{Number(item.total).toLocaleString('es-MX')}</strong></div><i><b style={{ width: `${(Number(item.total) / maximum) * 100}%` }} /></i></article>)}</div></section>
}

export default function App() {
  const [user, setUser] = useState(null)
  const [admin, setAdmin] = useState(null)
  const [checkingSession, setCheckingSession] = useState(true)

  useEffect(() => {
    Promise.all([
      apiFetch('/api/admin/me').then((response) => response.json()).catch(() => null),
      apiFetch('/api/auth/me').then((response) => response.json()).catch(() => null),
    ]).then(([adminResult, userResult]) => {
      if (adminResult?.data) setAdmin(adminResult.data)
      else if (userResult?.data) setUser(userResult.data)
    }).finally(() => setCheckingSession(false))
  }, [])

  useEffect(() => {
    if (!user) return undefined
    const expiresAt = Number(user.session_expires_at)
    if (!Number.isFinite(expiresAt)) return undefined
    let expired = false
    const expireSession = () => {
      if (expired || Date.now() < expiresAt) return
      expired = true
      apiFetch('/api/auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': readCsrfToken() } }).catch(() => {})
      setUser(null)
    }
    const timer = window.setTimeout(expireSession, Math.max(0, expiresAt - Date.now()))
    document.addEventListener('visibilitychange', expireSession)
    window.addEventListener('focus', expireSession)
    expireSession()
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', expireSession)
      window.removeEventListener('focus', expireSession)
    }
  }, [user])

  const logout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': readCsrfToken() } }).catch(() => {})
    setUser(null)
  }

  const adminLogout = async () => {
    await apiFetch('/api/admin/logout', { method: 'POST' }).catch(() => {})
    setAdmin(null)
  }

  if (checkingSession) return <div className="session-loader">Verificando sesión…</div>
  if (admin) return <AdminDashboard admin={admin} onLogout={adminLogout} />
  if (user) return <AuthenticatedWizard key={user.clave} user={user} onLogout={logout} onUserChange={setUser} />
  return <div className="app-layout"><LoginPanel onLogin={setUser} onAdminLogin={setAdmin} /><MapPanel /></div>
}
