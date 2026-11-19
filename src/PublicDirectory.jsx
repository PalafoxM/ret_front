import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import { divIcon } from 'leaflet'
import img4 from './assets/IMG4.jpg'
import img5 from './assets/IMG5.jpg'
import img6 from './assets/IMG6.jpg'
import img8 from './assets/IMG8.jpg'
import img10 from './assets/IMG10.jpg'
import img11 from './assets/IMG11.JPG'
import img12 from './assets/IMG12.JPG'
//import img13 from './assets/IMG13.JPG'

const DIRECTORY_BACKGROUNDS = [img4, img5, img6, img8, img10, img11, img12]
const DIRECTORY_BACKGROUND_KEY = 'ret_directory_background'

function chooseDirectoryBackground() {
  let previous = -1
  try { previous = Number.parseInt(window.localStorage.getItem(DIRECTORY_BACKGROUND_KEY), 10) } catch { previous = -1 }
  const choices = DIRECTORY_BACKGROUNDS.map((_, index) => index).filter((index) => index !== previous)
  const index = choices[Math.floor(Math.random() * choices.length)] ?? 0
  try { window.localStorage.setItem(DIRECTORY_BACKGROUND_KEY, String(index)) } catch { /* La imagen elegida sigue siendo válida sin almacenamiento local. */ }
  return DIRECTORY_BACKGROUNDS[index]
}

const validCoordinate = (value) => Number.isFinite(Number(value))

function DirectoryMapController({ locations }) {
  const map = useMap()
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => map.invalidateSize())
    if (locations.length === 1) map.setView([Number(locations[0].latitud), Number(locations[0].longitud)], 15)
    else if (locations.length > 1) map.fitBounds(locations.map((item) => [Number(item.latitud), Number(item.longitud)]), { padding: [42, 42], maxZoom: 15 })
    return () => window.cancelAnimationFrame(frame)
  }, [locations, map])
  return null
}

function DirectoryMap({ locations, icon, onSelect, compact = false }) {
  const mapped = locations.filter((item) => validCoordinate(item.latitud) && validCoordinate(item.longitud))
  if (!mapped.length) return <div className={`directory-map-empty${compact ? ' compact' : ''}`}><span aria-hidden="true">⌖</span><strong>Ubicación no disponible</strong><p>Este establecimiento aún no cuenta con coordenadas registradas.</p></div>
  const markerIcon = divIcon({
    className: 'directory-map-marker',
    html: `<span aria-hidden="true"><b>${icon || '📍'}</b></span>`,
    iconSize: [40, 48], iconAnchor: [20, 48], popupAnchor: [0, -44],
  })
  return <MapContainer center={[Number(mapped[0].latitud), Number(mapped[0].longitud)]} zoom={mapped.length === 1 ? 15 : 9} className={`directory-map${compact ? ' compact' : ''}`} scrollWheelZoom>
    <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
    <DirectoryMapController locations={mapped} />
    {mapped.map((item) => <Marker key={item.clave} position={[Number(item.latitud), Number(item.longitud)]} icon={markerIcon} eventHandlers={onSelect ? { click: () => onSelect(item) } : undefined}><Popup><strong>{item.nombre_comercial || 'Establecimiento turístico'}</strong><p>{item.municipio || item.direccion || 'Guanajuato'}</p></Popup></Marker>)}
  </MapContainer>
}

function DirectorySearch({ value, onChange, placeholder, label }) {
  return <label className="directory-search"><span className="visually-hidden">{label}</span><b aria-hidden="true">⌕</b><input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} maxLength="100" /></label>
}

const websiteHref = (value) => {
  const text = String(value || '').trim()
  if (!text) return ''
  return /^https?:\/\//i.test(text) ? text : `https://${text.replace(/^\/+/, '')}`
}

export default function PublicDirectory({ apiFetch, cleanText, giroIcons, onShowResource }) {
  const [giros, setGiros] = useState([])
  const [municipios, setMunicipios] = useState([])
  const [catalogStatus, setCatalogStatus] = useState({ giros: 'loading', municipios: 'loading' })
  const [view, setView] = useState('filters')
  const [giroId, setGiroId] = useState('')
  const [municipioId, setMunicipioId] = useState('')
  const [selectedPlace, setSelectedPlace] = useState(null)
  const [placeSearch, setPlaceSearch] = useState('')
  const [page, setPage] = useState(1)
  const [results, setResults] = useState({ rows: [], total: 0, page: 1, pages: 1 })
  const [resultStatus, setResultStatus] = useState('idle')
  const [resultMessage, setResultMessage] = useState('')
  const [backgroundImage] = useState(chooseDirectoryBackground)
  const panelRef = useRef(null)

  useEffect(() => {
    const controller = new AbortController()
    const loadCatalog = async (path, key, setter) => {
      try {
        const response = await apiFetch(path, { signal: controller.signal })
        const payload = await response.json()
        setter(Array.isArray(payload.data) ? payload.data : [])
        setCatalogStatus((current) => ({ ...current, [key]: 'ready' }))
      } catch (error) {
        if (error.name !== 'AbortError') setCatalogStatus((current) => ({ ...current, [key]: 'error' }))
      }
    }
    loadCatalog('/api/giros?directorio=1', 'giros', setGiros)
    loadCatalog('/api/municipios', 'municipios', setMunicipios)
    return () => controller.abort()
  }, [apiFetch])

  const selectedGiro = useMemo(() => giros.find((item) => String(item.id_giro) === giroId) || null, [giroId, giros])
  const selectedMunicipio = useMemo(() => municipios.find((item) => String(item.id_municipio) === municipioId) || null, [municipioId, municipios])
  const hasFilters = Boolean(giroId || municipioId)

  useEffect(() => {
    if (!hasFilters) return undefined
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setResultStatus('loading')
      setResultMessage('')
      const query = new URLSearchParams({ page: String(page), pageSize: '12' })
      if (giroId) query.set('giro', giroId)
      if (municipioId) query.set('municipio', municipioId)
      if (placeSearch.trim()) query.set('busqueda', placeSearch.trim())
      apiFetch(`/api/directorio/establecimientos?${query}`, { signal: controller.signal })
        .then((response) => response.json())
        .then((payload) => {
          setResults(payload.data || { rows: [], total: 0, page: 1, pages: 1 })
          setResultStatus('ready')
          setView('results')
        })
        .catch((error) => { if (error.name !== 'AbortError') { setResultStatus('error'); setResultMessage(error.serverMessage || 'No fue posible consultar el directorio.') } })
    }, 250)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [apiFetch, giroId, hasFilters, municipioId, page, placeSearch])

  useEffect(() => { panelRef.current?.scrollTo({ top: 0, behavior: 'smooth' }) }, [view, selectedPlace])

  const openDetail = (place) => { setSelectedPlace(place); setView('detail') }
  const updateGiro = (value) => { setGiroId(value); setPage(1); setSelectedPlace(null); setView(value || municipioId ? 'results' : 'filters'); if (!value && !municipioId) { setResultStatus('idle'); setResults({ rows: [], total: 0, page: 1, pages: 1 }) } }
  const updateMunicipio = (value) => { setMunicipioId(value); setPage(1); setSelectedPlace(null); setView(value || giroId ? 'results' : 'filters'); if (!value && !giroId) { setResultStatus('idle'); setResults({ rows: [], total: 0, page: 1, pages: 1 }) } }
  const giroIcon = giroIcons[selectedGiro?.id_giro] || '📍'
  const resultsTitle = selectedGiro ? cleanText(selectedGiro.giro) : selectedMunicipio ? `Establecimientos en ${selectedMunicipio.municipio}` : 'Directorio turístico'

  return <main className="public-directory" ref={panelRef}>
    <header className="directory-hero">
      <div><span className="eyebrow">Consulta ciudadana</span><h2>Descubre Guanajuato</h2><p>Encuentra experiencias y servicios turísticos registrados de forma rápida y visual.</p></div>
      <nav aria-label="Recursos de ayuda"><button type="button" onClick={() => onShowResource('Manual de usuario')}>Manual de usuario</button><button type="button" onClick={() => onShowResource('Preguntas frecuentes')}>Preguntas frecuentes</button></nav>
    </header>

    {view === 'detail' && <nav className="directory-breadcrumb" aria-label="Navegación del directorio"><button type="button" onClick={() => setView('results')}>Resultados</button><span>/</span><strong>{selectedPlace?.nombre_comercial}</strong></nav>}

    <section className="directory-filter-panel" aria-labelledby="directory-filter-title">
      <div className="directory-filter-heading"><span>Directorio turístico RET</span><h3 id="directory-filter-title">Encuentra tu próxima experiencia</h3><p>Selecciona un giro, un municipio o combina ambos filtros.</p></div>
      <div className="directory-filter-controls">
        <label><span><b aria-hidden="true">✦</b> Giro</span><select value={giroId} disabled={catalogStatus.giros === 'loading'} onChange={(event) => updateGiro(event.target.value)}><option value="">{catalogStatus.giros === 'loading' ? 'Cargando giros…' : 'Selecciona un giro'}</option>{giros.map((giro) => <option value={giro.id_giro} key={giro.id_giro}>{cleanText(giro.giro)}</option>)}</select>{catalogStatus.giros === 'error' && <small>No fue posible cargar los giros.</small>}</label>
        <label><span><b aria-hidden="true">⌖</b> Municipio</span><select value={municipioId} disabled={catalogStatus.municipios === 'loading'} onChange={(event) => updateMunicipio(event.target.value)}><option value="">{catalogStatus.municipios === 'loading' ? 'Cargando municipios…' : 'Selecciona un municipio'}</option>{municipios.map((municipio) => <option value={municipio.id_municipio} key={municipio.id_municipio}>{municipio.municipio}</option>)}</select>{catalogStatus.municipios === 'error' && <small>No fue posible cargar los municipios.</small>}</label>
      </div>
    </section>

    {!hasFilters && view !== 'detail' && <section className="directory-view directory-filter-hero" style={{ backgroundImage: `linear-gradient(110deg, rgba(3,34,62,.86), rgba(3,54,82,.42)), url(${backgroundImage})` }}><div className="directory-filter-copy"><span>Explora Guanajuato</span><h3>Explora los establecimientos turísticos</h3><p>Selecciona al menos un giro o municipio en los filtros superiores para consultar los resultados.</p></div></section>}

    {view === 'results' && <section className="directory-view directory-results" aria-labelledby="directory-results-title">
      <div className="directory-section-heading"><div><span>{giroIcon} Directorio turístico</span><h3 id="directory-results-title">{resultsTitle}</h3></div><p>{results.total.toLocaleString('es-MX')} {results.total === 1 ? 'establecimiento encontrado' : 'establecimientos encontrados'}</p></div>
      <DirectorySearch value={placeSearch} onChange={(value) => { setPlaceSearch(value); setPage(1) }} label="Buscar establecimiento" placeholder="Buscar por nombre, municipio, colonia o descripción…" />
      {resultStatus === 'loading' && <div className="directory-state"><i className="directory-spinner" /><strong>Buscando establecimientos…</strong></div>}
      {resultStatus === 'error' && <div className="directory-state error"><span>!</span><strong>No fue posible cargar los resultados</strong><p>{resultMessage}</p></div>}
      {resultStatus === 'ready' && results.rows.length === 0 && <div className="directory-state"><span aria-hidden="true">⌕</span><strong>Sin resultados</strong><p>Prueba con otro nombre o municipio.</p></div>}
      {resultStatus === 'ready' && results.rows.length > 0 && <div className="results-layout"><div className="establishment-list">{results.rows.map((place) => <article className="establishment-card" key={place.clave}><div className="establishment-card-icon" aria-hidden="true">{giroIcon}</div><div><span>{place.subrubro ? cleanText(place.subrubro) : cleanText(place.giro_nombre)}</span><h4>{place.nombre_comercial || 'Establecimiento turístico'}</h4><p>⌖ {place.municipio || 'Guanajuato'}{place.colonia ? ` · ${place.colonia}` : ''}</p><small>{place.descripcion || 'Información disponible en el detalle del establecimiento.'}</small></div><button type="button" onClick={() => openDetail(place)} aria-label={`Ver detalles de ${place.nombre_comercial}`}>Ver detalles <span aria-hidden="true">→</span></button></article>)}</div></div>}
      {resultStatus === 'ready' && results.pages > 1 && <nav className="directory-pagination" aria-label="Páginas de establecimientos"><button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>← Anterior</button><span>Página <strong>{results.page}</strong> de {results.pages}</span><button type="button" disabled={page >= results.pages} onClick={() => setPage((current) => Math.min(results.pages, current + 1))}>Siguiente →</button></nav>}
    </section>}

    {view === 'detail' && selectedPlace && <section className="directory-view establishment-detail" aria-labelledby="establishment-detail-title">
      <button className="directory-back" type="button" onClick={() => setView('results')}>← Volver a resultados</button>
      <header><div className="detail-icon" aria-hidden="true">{giroIcon}</div><div><span>{cleanText(selectedPlace.giro_nombre)}</span><h3 id="establishment-detail-title">{selectedPlace.nombre_comercial || 'Establecimiento turístico'}</h3><p>⌖ {selectedPlace.municipio || 'Guanajuato'}</p></div></header>
      <div className="detail-layout"><div className="detail-information"><section><span className="detail-category">{selectedPlace.subrubro ? cleanText(selectedPlace.subrubro) : cleanText(selectedPlace.giro_nombre)}</span><h4>Información del establecimiento</h4><p>{selectedPlace.descripcion || 'Este establecimiento aún no cuenta con una descripción pública.'}</p></section><dl><div><dt>Dirección</dt><dd>⌖ {selectedPlace.direccion || 'No disponible'}</dd></div><div><dt>Teléfono</dt><dd>{selectedPlace.telefono_comercial ? <a href={`tel:${String(selectedPlace.telefono_comercial).replace(/[^\d+]/g, '')}`}>{selectedPlace.telefono_comercial}</a> : 'No disponible'}{selectedPlace.telefono2 && <small>Alternativo: {selectedPlace.telefono2}</small>}</dd></div><div><dt>Correo electrónico</dt><dd>{selectedPlace.correo ? <a href={`mailto:${selectedPlace.correo}`}>{selectedPlace.correo}</a> : 'No disponible'}</dd></div><div><dt>Sitio web</dt><dd>{selectedPlace.web ? <a href={websiteHref(selectedPlace.web)} target="_blank" rel="noopener noreferrer">Visitar sitio web ↗</a> : 'No disponible'}</dd></div></dl></div><aside className="detail-map"><div><span>Ubicación</span><strong>Explora el mapa</strong></div><DirectoryMap locations={[selectedPlace]} icon={giroIcon} compact /></aside></div>
    </section>}
  </main>
}
