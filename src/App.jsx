import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { divIcon } from 'leaflet'
import Swal from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'
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

const DEFAULT_CENTER = [23.6345, -102.5528]
const ESTABLECIMIENTO_TOKEN = import.meta.env.TOKEN_ESTABLECIMIENTO
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
      fetch('/api/giros', { signal: controller.signal }).then((response) => response.json()),
      fetch('/api/municipios', { signal: controller.signal }).then((response) => response.json()),
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
      const response = await fetch('/api/registro', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(!usesExistingAccount && { 'x-establecimiento-token': ESTABLECIMIENTO_TOKEN }),
        },
        body: JSON.stringify(payload),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message || 'No fue posible completar el registro.')
      if (result.data?.existingAccount && onRegistered) {
        await onRegistered(result.data)
        return
      }
      setRegistrationResult(result.data)
    } catch (error) {
      await Swal.fire({
        icon: 'error',
        title: 'No fue posible completar el registro',
        text: error.message || 'Ocurrió un error inesperado. Intenta nuevamente.',
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
          ? 'Enviamos estas credenciales al correo indicado. También puedes guardarlas ahora.'
          : 'No fue posible enviar el correo. Guarda estas credenciales; la contraseña temporal solamente se mostrará en este momento.'}</p>
        <dl><div><dt>Clave RET del establecimiento</dt><dd>{registrationResult.clave}</dd></div>{!registrationResult.existingAccount && <div><dt>Contraseña temporal</dt><dd>{registrationResult.temporaryPassword}</dd></div>}</dl>
        <button className="registration-submit" type="button" onClick={() => onRegistered ? onRegistered(registrationResult) : onClose()}>Finalizar</button>
      </div> : <form className="registration-form" onSubmit={submitRegistration}>
        <label className="registration-field registration-wide">Registro Federal de Contribuyentes (RFC)<input name="rfc" placeholder="Ej. ABCD010203EF4" minLength="12" maxLength="13" required /></label>
        <label className="registration-field">Giro comercial<select name="giro" defaultValue="" required><option value="" disabled>Elegir giro…</option>{giros.map((item) => <option key={item.id_giro} value={item.id_giro}>{GIRO_ICONS[item.id_giro] || '📍'} {item.giro}</option>)}</select></label>
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

function LoginPanel({ onLogin }) {
  const [showPassword, setShowPassword] = useState(false)
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
          const response = await fetch('/api/auth/recuperar-password', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email: String(value).trim().toLowerCase() }),
          })
          const payload = await response.json()
          if (!response.ok) throw new Error(payload.message || 'No fue posible procesar la solicitud')
          return payload
        } catch (error) {
          Swal.showValidationMessage(error.message || 'No fue posible conectar con el servidor')
          return false
        }
      },
    })
    if (result.isConfirmed) {
      await Swal.fire({
        icon: 'success',
        title: 'Solicitud recibida',
        text: result.value?.message || 'Si el correo está registrado, recibirás nuevas credenciales.',
        confirmButtonColor: '#0878b9',
      })
    }
  }
  const submit = async (event) => {
    event.preventDefault()
    setMessage('')
    const formData = new FormData(event.currentTarget)
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clave: formData.get('clave'),
          password: formData.get('password'),
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message || 'No fue posible iniciar sesión.')
      onLogin(result.data)
    } catch (error) {
      setMessage(error.message)
    }
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
        <div className="field"><span aria-hidden="true">◇</span><input id="password" name="password" type={showPassword ? 'text' : 'password'} placeholder="Tu contraseña" autoComplete="current-password" required /><button className="show-password" type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{showPassword ? '◉' : '◎'}</button></div>
        <button className="primary-button" type="submit">Iniciar sesión <span aria-hidden="true">→</span></button>
        <button className="secondary-button" type="button" onClick={() => setShowRegistration(true)}>Registrarse <span aria-hidden="true">+</span></button>
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
    fetch('/api/form/datos-generales', { signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.message); return result })
      .then((result) => { setData(result.data); setSubrubros(result.subrubros || []) })
      .catch((error) => { if (error.name !== 'AbortError') setMessage(error.message || 'No fue posible cargar el formulario.') })
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
      const response = await fetch('/api/form/datos-generales', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message)
      setMessage(result.message)
      onContinue()
    } catch (error) {
      setMessage(error.message || 'No fue posible guardar los datos.')
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
    <FormSection icon="🏢" title="Sub-Rubro"><div className="general-grid"><label className="wide">Subrubro al que pertenece *<select {...field('idgiro_subrubro')} required><option value="">Elegir opción…</option>{subrubros.map((item) => <option key={item.idgiro_subrubro} value={item.idgiro_subrubro}>{item.descripcion}</option>)}</select></label></div></FormSection>
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
    fetch('/api/form/datos-tecnicos', { signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.message); return result })
      .then((result) => {
        const normalized = { ...result.data }
        for (const name of ['inst_disca', 'lgbttit', 'pet_friendly']) {
          if (String(normalized[name]).toUpperCase() === 'SI') normalized[name] = '1'
          else if (String(normalized[name]).toUpperCase() === 'NO') normalized[name] = '0'
        }
        setData(normalized)
      })
      .catch((error) => { if (error.name !== 'AbortError') setMessage(error.message || 'No fue posible cargar los datos técnicos.') })
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
      const response = await fetch('/api/form/datos-tecnicos', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message)
      setMessage(result.message)
      onContinue()
    } catch (error) {
      setMessage(error.message || 'No fue posible guardar los datos técnicos.')
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
    fetch('/api/form/datos-legales', { signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.message); return result })
      .then((result) => setMetadata(result.data))
      .catch((error) => { if (error.name !== 'AbortError') setMessage(error.message || 'No fue posible cargar el expediente legal.') })
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
      const response = await fetch('/api/form/datos-legales', { method: 'POST', body: formData })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message)
      setMessage(result.message)
      onContinue()
    } catch (error) {
      setMessage(error.message || 'No fue posible guardar los documentos.')
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
    fetch('/api/form/datos-graficos', { signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.message); return result })
      .then((result) => { setMetadata(result.data); setAccepted(Boolean(Number(result.data.promocion_gtomx))) })
      .catch((error) => { if (error.name !== 'AbortError') setMessage(error.message || 'No fue posible cargar la documentación gráfica.') })
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
      const response = await fetch('/api/form/datos-graficos', { method: 'POST', body: formData })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message)
      setMessage(result.message)
      onContinue()
    } catch (error) {
      setMessage(error.message || 'No fue posible guardar las imágenes.')
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
    fetch('/api/form/hospedaje', { signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.message); return result })
      .then((result) => setData(result.data))
      .catch((error) => { if (error.name !== 'AbortError') setMessage(error.message || 'No fue posible cargar el formulario de hospedaje.') })
    return () => controller.abort()
  }, [])
  const update = (name, value) => setData((current) => ({ ...current, [name]: value }))
  const field = (name) => ({ value: data[name] ?? '', onChange: (event) => update(name, event.target.value) })
  const option = ([name, label]) => <label className="lodging-option" key={name}><input type="checkbox" checked={Boolean(Number(data[name]))} onChange={(event) => update(name, Number(event.target.checked))} /><span>{label}</span></label>
  const save = async (form) => {
    if (form && !form.reportValidity()) return
    setSaving(true); setMessage('')
    try {
      const response = await fetch('/api/form/hospedaje', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message)
      setMessage(result.message); onContinue()
    } catch (error) {
      setMessage(error.message || 'No fue posible guardar el formulario de hospedaje.')
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
    fetch('/api/form/agencia', { signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.message); return result })
      .then((result) => setData(result.data))
      .catch((error) => { if (error.name !== 'AbortError') setMessage(error.message || 'No fue posible cargar el formulario de agencia de viajes.') })
    return () => controller.abort()
  }, [])
  const update = (name, value) => setData((current) => ({ ...current, [name]: value }))
  const field = (name) => ({ value: data[name] ?? '', onChange: (event) => update(name, event.target.value) })
  const save = async (form) => {
    if (form && !form.reportValidity()) return
    setSaving(true); setMessage('')
    try {
      const response = await fetch('/api/form/agencia', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message)
      onContinue()
    } catch (error) {
      setMessage(error.message || 'No fue posible guardar el formulario de agencia de viajes.')
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
    fetch('/api/form/guia', { signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.message); return result })
      .then((result) => setData(result.data))
      .catch((error) => { if (error.name !== 'AbortError') setMessage(error.message || 'No fue posible cargar el formulario de guía de turistas.') })
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
      const response = await fetch('/api/form/guia', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message)
      onContinue()
    } catch (error) {
      setMessage(error.message || 'No fue posible guardar el formulario de guía de turistas.')
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
    fetch('/api/form/promotores', { signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.message); return result })
      .then((result) => setData(result.data))
      .catch((error) => { if (error.name !== 'AbortError') setMessage(error.message || 'No fue posible cargar el formulario de operador de eventos.') })
    return () => controller.abort()
  }, [])
  const update = (name, value) => setData((current) => ({ ...current, [name]: value }))
  const field = (name) => ({ value: data[name] ?? '', onChange: (event) => update(name, event.target.value) })
  const save = async (form) => {
    if (form && !form.reportValidity()) return
    setSaving(true); setMessage('')
    try {
      const response = await fetch('/api/form/promotores', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message)
      onContinue()
    } catch (error) {
      setMessage(error.message || 'No fue posible guardar el formulario de operador de eventos.')
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
    fetch('/api/form/restaurantes', { signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.message); return result })
      .then((result) => setData(result.data))
      .catch((error) => { if (error.name !== 'AbortError') setMessage(error.message || 'No fue posible cargar el formulario de alimentos y bebidas.') })
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
      const response = await fetch('/api/form/restaurantes', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message)
      onContinue()
    } catch (error) {
      setMessage(error.message || 'No fue posible guardar el formulario de alimentos y bebidas.')
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
const GOLF_SERVICES = Array.from({ length: 9 }, (_, index) => [`serv${String(index + 1).padStart(2, '0')}`, `Servicio ${String(index + 1).padStart(2, '0')}`])
const GOLF_PAYMENTS = Array.from({ length: 6 }, (_, index) => [`tc${String(index + 1).padStart(2, '0')}`, `Tarjeta / medio ${String(index + 1).padStart(2, '0')}`])

function GolfStep({ onContinue, onBack }) {
  const [data, setData] = useState(null)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/form/golf', { signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.message); return result })
      .then((result) => setData(result.data))
      .catch((error) => { if (error.name !== 'AbortError') setMessage(error.message || 'No fue posible cargar el formulario de campo de golf.') })
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
      const response = await fetch('/api/form/golf', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message)
      onContinue()
    } catch (error) {
      setMessage(error.message || 'No fue posible guardar el formulario de campo de golf.')
    } finally { setSaving(false) }
  }
  if (!data) return <div className="form-loading">{message || 'Cargando formulario de campo de golf…'}</div>
  return <div className="general-form golf-form">
    <div className="technical-nav"><button type="button" onClick={onBack}>← Anterior</button><button type="button" onClick={onContinue}>Siguiente →</button></div>
    <div className="legal-intro"><div><span className="eyebrow">Paso en curso</span><strong>80% completado</strong></div><p>Captura las características, servicios y medios de pago del campo.</p></div>
    <FormSection icon="⛳" title="Campo de Golf">
      <div className="general-grid">
        {yesNo('turistico', '¿Es un campo turístico?')}{yesNo('carrito', '¿Cuenta con carritos?')}{yesNo('privado', '¿Es privado?')}
        <label>Número de hoyos *<input {...field('hoyos')} type="number" min="1" max="999" required /></label>
        <label>Par del campo *<input {...field('par')} type="number" min="1" max="999" required /></label>
        <label>Longitud *<input {...field('longitud')} type="number" min="1" max="9999999" required /></label>
        <label>Diseñado por *<input {...field('disenado')} maxLength="120" required /></label>
        <label>Fairways *<input {...field('fairways')} maxLength="120" required /></label>
        <label>Greens *<input {...field('greens')} maxLength="120" required /></label>
      </div>
    </FormSection>
    <FormSection icon="🏞️" title="Tipo de Terreno"><p className="section-instruction">Selecciona al menos una opción.</p><div className="lodging-options">{GOLF_TERRAINS.map(checkbox)}</div></FormSection>
    <FormSection icon="🏌️" title="Servicios"><div className="lodging-options">{GOLF_SERVICES.map(checkbox)}</div></FormSection>
    <FormSection icon="💳" title="Tarjetas y Medios de Pago"><div className="lodging-options">{GOLF_PAYMENTS.map(checkbox)}</div><div className="general-grid"><label className="wide">Otro medio de pago<input {...field('otra_tc')} maxLength="120" placeholder="Otro medio" /></label></div></FormSection>
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
    fetch('/api/form/arte', { signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.message); return result })
      .then((result) => setData(result.data))
      .catch((error) => { if (error.name !== 'AbortError') setMessage(error.message || 'No fue posible cargar el formulario de arte popular.') })
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
      const response = await fetch('/api/form/arte', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message)
      onContinue()
    } catch (error) {
      setMessage(error.message || 'No fue posible guardar el formulario de arte popular.')
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

const RENTAL_PERMITS = [['perm1', 'Permiso municipal'], ['perm2', 'Permiso estatal'], ['perm3', 'Permiso federal']]
const RENTAL_FEATURES = Array.from({ length: 14 }, (_, index) => [`caract${index + 1}`, `Característica ${index + 1}`])
const RENTAL_MODALITIES = Array.from({ length: 5 }, (_, index) => [`mod${String(index + 1).padStart(2, '0')}`, `Modalidad ${String(index + 1).padStart(2, '0')}`])
const RENTAL_SERVICES = Array.from({ length: 12 }, (_, index) => [`serv${String(index + 1).padStart(2, '0')}`, `Unidad / servicio ${String(index + 1).padStart(2, '0')}`])
const RENTAL_PAYMENTS = Array.from({ length: 6 }, (_, index) => [`tc${String(index + 1).padStart(2, '0')}`, `Forma de pago ${String(index + 1).padStart(2, '0')}`])

function ArrendadoraStep({ onContinue, onBack }) {
  const [data, setData] = useState(null)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/form/arrendadora', { signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.message); return result })
      .then((result) => setData(result.data))
      .catch((error) => { if (error.name !== 'AbortError') setMessage(error.message || 'No fue posible cargar el formulario de arrendamiento de autos.') })
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
      const response = await fetch('/api/form/arrendadora', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message)
      onContinue()
    } catch (error) {
      setMessage(error.message || 'No fue posible guardar el formulario de arrendamiento de autos.')
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
    <FormSection icon="💳" title="Formas de Pago"><div className="lodging-options">{RENTAL_PAYMENTS.map(checkbox)}</div><div className="general-grid"><label className="wide">Otra forma de pago<input {...field('otra_tc')} maxLength="120" /></label></div></FormSection>
    {message && <p className="general-message" role="status">{message}</p>}
    <button className="save-general" type="button" disabled={saving} onClick={(event) => save(event.currentTarget.form)}>{saving ? 'Guardando arrendadora…' : 'Guardar y continuar'} <span>→</span></button>
  </div>
}

const PARK_SERVICES = Array.from({ length: 35 }, (_, index) => [`serv${String(index + 1).padStart(2, '0')}`, `Servicio adicional ${index + 1}`])
const PARK_PAYMENTS = Array.from({ length: 6 }, (_, index) => [`tc${String(index + 1).padStart(2, '0')}`, `Forma de pago ${index + 1}`])

function ParquesStep({ onContinue, onBack }) {
  const [data, setData] = useState(null)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/form/parques', { signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.message); return result })
      .then((result) => setData(result.data))
      .catch((error) => { if (error.name !== 'AbortError') setMessage(error.message || 'No fue posible cargar el formulario de espacios turísticos.') })
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
      const response = await fetch('/api/form/parques', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message)
      onContinue()
    } catch (error) {
      setMessage(error.message || 'No fue posible guardar el formulario de espacios turísticos.')
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
    <FormSection icon="💳" title="Formas de Pago"><div className="lodging-options">{PARK_PAYMENTS.map(checkbox)}</div><div className="general-grid"><label className="wide">Otra forma de pago<input {...field('otra_tc')} maxLength="120" /></label></div></FormSection>
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
    fetch('/api/form/auxturistico', { signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.message); return result })
      .then((result) => setData(result.data))
      .catch((error) => { if (error.name !== 'AbortError') setMessage(error.message || 'No fue posible cargar el formulario de operador turístico.') })
    return () => controller.abort()
  }, [])
  const update = (name, value) => setData((current) => ({ ...current, [name]: value }))
  const checkbox = ([name, label]) => <label className="lodging-option" key={name}><input type="checkbox" checked={Boolean(Number(data[name]))} onChange={(event) => update(name, Number(event.target.checked))} /><span>{label}</span></label>
  const save = async (form) => {
    if (form && !form.reportValidity()) return
    if (!TOUR_OPERATOR_SHIFTS.some(([name]) => Number(data[name]) === 1)) { setMessage('Selecciona al menos un turno de operación.'); return }
    setSaving(true); setMessage('')
    try {
      const response = await fetch('/api/form/auxturistico', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message)
      onContinue()
    } catch (error) {
      setMessage(error.message || 'No fue posible guardar el formulario de operador turístico.')
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
      const response = await fetch('/api/form/encuesta', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fue_utilidad: utility, facil_navegacion: navigation, gustaria: information }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message)
      setSubmitted(true)
      onComplete()
    } catch (error) {
      setMessage(error.message || 'No fue posible guardar la encuesta.')
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

function MyRecordsModal({ onClose, onSelect }) {
  const [records, setRecords] = useState(null)
  const [message, setMessage] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/mis-registros', { signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.message); return result })
      .then((result) => setRecords(result.data || []))
      .catch((error) => { if (error.name !== 'AbortError') setMessage(error.message || 'No fue posible cargar tus registros.') })
    return () => controller.abort()
  }, [])
  const selectRecord = async (record) => {
    if (record.actual) { onClose(); return }
    try {
      const response = await fetch(`/api/mis-registros/${encodeURIComponent(record.clave)}/seleccionar`, { method: 'POST' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message)
      onSelect(result.data)
    } catch (error) { setMessage(error.message || 'No fue posible seleccionar el establecimiento.') }
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
      const response = await fetch(`/api/mis-registros/${encodeURIComponent(record.clave)}`, { method: 'DELETE' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message)
      setRecords((current) => current.filter((item) => item.clave !== record.clave))
      await Swal.fire({ icon: 'success', title: 'Registro eliminado', text: result.message, confirmButtonColor: '#0878b9' })
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'No fue posible eliminarlo', text: error.message, confirmButtonColor: '#0878b9' })
    }
  }
  return createPortal(<div className="records-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="records-modal" role="dialog" aria-modal="true" aria-labelledby="records-title">
      <button className="modal-close" type="button" onClick={onClose} aria-label="Cerrar">×</button>
      <header><span className="step-pill">Mi cuenta</span><h2 id="records-title">Mis registros</h2><p>Administra los establecimientos asociados a tu correo.</p></header>
      {message && <p className="general-message" role="status">{message}</p>}
      {!records ? <div className="form-loading">Cargando establecimientos…</div> : <div className="records-list">{records.map((record) => <article className={record.actual ? 'current' : ''} key={record.clave}>
        <div className="record-main"><span className="record-icon">{GIRO_ICONS[record.id_giro] || '📍'}</span><div><strong>{record.nombre_comercial || 'Establecimiento sin nombre'}</strong><span>{record.clave} · {record.giro || 'Giro sin especificar'}</span><small>{record.municipio || 'Municipio sin especificar'} · {record.porcentaje_registro || 0}% completado</small></div>{record.actual && <b>Actual</b>}</div>
        <div className="record-actions">
          <button type="button" title="Editar establecimiento" aria-label={`Editar ${record.nombre_comercial}`} onClick={() => selectRecord(record)}>✎</button>
          <button type="button" title="Ver formato" aria-label={`Ver formato de ${record.nombre_comercial}`} onClick={() => showFormat(record)}>▤</button>
          <button className="delete" type="button" title="Eliminar registro" aria-label={`Eliminar ${record.nombre_comercial}`} onClick={() => deleteRecord(record)}>🗑</button>
        </div>
      </article>)}</div>}
    </section>
  </div>, document.body)
}

function AuthenticatedWizard({ user, onLogout, onUserChange }) {
  const [step, setStep] = useState(0)
  const [showRecords, setShowRecords] = useState(false)
  const [showNewRegistration, setShowNewRegistration] = useState(false)
  const giroStepNames = { 2: 'Formulario de Agencia de Viajes', 3: 'Formulario de Guía de Turistas', 4: 'Formulario de Operador de Eventos', 5: 'Formulario de Alimentos y Bebidas', 6: 'Formulario de Campo de Golf', 7: 'Formulario de Arte Popular y Productos', 9: 'Formulario de Arrendamiento de Autos', 10: 'Formulario de Espacios Turísticos', 11: 'Formulario de Operador Turístico' }
  const skipsGiroForm = Number(user.giro) === 8
  const wizardSteps = skipsGiroForm
    ? WIZARD_STEPS.filter((_, index) => index !== 4)
    : giroStepNames[Number(user.giro)]
      ? WIZARD_STEPS.map((label, index) => index === 4 ? giroStepNames[Number(user.giro)] : label)
      : WIZARD_STEPS
  const experienceStep = skipsGiroForm ? 4 : 5
  const continueWithNewRegistration = async (registration) => {
    const response = await fetch(`/api/mis-registros/${encodeURIComponent(registration.clave)}/seleccionar`, { method: 'POST' })
    const result = await response.json()
    if (!response.ok) throw new Error(result.message || 'El registro fue creado, pero no fue posible abrir su formulario.')
    setShowNewRegistration(false)
    onUserChange(result.data)
  }

  return <main className="wizard-page">
    <header className="wizard-topbar">
    
         <img  src={logoRet} alt="RET" width="100" />
      <div className="wizard-header-actions"><div className="records-shortcuts"><button className="new-record-button" type="button" onClick={() => setShowNewRegistration(true)}>＋ Nuevo registro</button><button className="my-records-button" type="button" onClick={() => setShowRecords(true)}>Mis registros</button></div><div className="wizard-user"><div><strong>{user.nombre_comercial || user.clave}</strong><span>{user.clave}</span></div><button type="button" onClick={onLogout}>Cerrar sesión</button></div></div>
    </header>
    <div className="wizard-layout">
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
          {step === experienceStep && <ExperienciaStep onBack={() => setStep(skipsGiroForm ? 3 : 4)} onComplete={() => setShowRecords(true)} />}
        </form>
      </section>
    </div>
    {showRecords && <MyRecordsModal onClose={() => setShowRecords(false)} onSelect={(selected) => { setShowRecords(false); onUserChange(selected) }} />}
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
    fetch('/api/giros', { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error(); return response.json() })
      .then(({ data }) => setGiros(Array.isArray(data) ? data : []))
      .catch(() => {})
    return () => controller.abort()
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/establecimientos?giro=${encodeURIComponent(selectedGiro)}`, {
      signal: controller.signal,
      headers: { 'x-establecimiento-token': ESTABLECIMIENTO_TOKEN },
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
    <div className="map-header"><div><span className="eyebrow map-eyebrow">Explora la red</span><h2>Una entrada más clara, actual y poderosa para el RET.</h2></div><label className="search-box giro-select"><select value={selectedGiro} onChange={changeGiro} aria-label="Seleccionar giro">{giros.length === 0 && <option value="1">🏨 01. Hospedaje</option>}{giros.map((item) => <option key={item.id_giro} value={item.id_giro}>{GIRO_ICONS[item.id_giro] || '📍'} {item.giro}</option>)}</select></label></div>
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

export default function App() {
  const [user, setUser] = useState(null)
  const [checkingSession, setCheckingSession] = useState(true)

  useEffect(() => {
    fetch('/api/auth/me')
      .then((response) => response.ok ? response.json() : null)
      .then((result) => { if (result?.data) setUser(result.data) })
      .finally(() => setCheckingSession(false))
  }, [])

  useEffect(() => {
    if (!user) return undefined
    const expiresAt = Number(user.session_expires_at)
    if (!Number.isFinite(expiresAt)) return undefined
    let expired = false
    const expireSession = () => {
      if (expired || Date.now() < expiresAt) return
      expired = true
      fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
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
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    setUser(null)
  }

  if (checkingSession) return <div className="session-loader">Verificando sesión…</div>
  if (user) return <AuthenticatedWizard key={user.clave} user={user} onLogout={logout} onUserChange={setUser} />
  return <div className="app-layout"><LoginPanel onLogin={setUser} /><MapPanel /></div>
}
