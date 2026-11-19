import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import { divIcon } from 'leaflet'

const CATEGORY_GROUPS = [
  { id: 'hospedaje', label: 'Hospedaje', description: 'Hoteles y alojamientos', icon: '🏨', color: '#7257e8', giros: [1, 17] },
  { id: 'gastronomia', label: 'Alimentos y bebidas', description: 'Restaurantes, bares y cafeterías', icon: '🍽️', color: '#dc3f45', giros: [5] },
  { id: 'viajes', label: 'Viajes y recorridos', description: 'Agencias, guías y operadores', icon: '✈️', color: '#2672e8', giros: [2, 3, 11] },
  { id: 'eventos', label: 'Eventos y recintos', description: 'Organización y espacios turísticos', icon: '🎪', color: '#c82dcc', giros: [4, 10, 16] },
  { id: 'bienestar', label: 'Bienestar y recreación', description: 'Golf, balnearios, deporte y spa', icon: '🌿', color: '#169a55', giros: [6, 12, 14, 15] },
  { id: 'cultura', label: 'Cultura y aprendizaje', description: 'Arte, sitios y capacitación', icon: '🏺', color: '#df8b20', giros: [7, 8, 13] },
  { id: 'movilidad', label: 'Movilidad turística', description: 'Arrendamiento y transporte', icon: '🚗', color: '#087f9d', giros: [9] },
]

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
  const [catalogStatus, setCatalogStatus] = useState('loading')
  const [view, setView] = useState('categories')
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [selectedGiro, setSelectedGiro] = useState(null)
  const [selectedPlace, setSelectedPlace] = useState(null)
  const [giroSearch, setGiroSearch] = useState('')
  const [placeSearch, setPlaceSearch] = useState('')
  const [page, setPage] = useState(1)
  const [results, setResults] = useState({ rows: [], total: 0, page: 1, pages: 1 })
  const [resultStatus, setResultStatus] = useState('idle')
  const [resultMessage, setResultMessage] = useState('')
  const panelRef = useRef(null)

  useEffect(() => {
    const controller = new AbortController()
    apiFetch('/api/giros', { signal: controller.signal })
      .then((response) => response.json())
      .then((payload) => { setGiros(Array.isArray(payload.data) ? payload.data : []); setCatalogStatus('ready') })
      .catch((error) => { if (error.name !== 'AbortError') setCatalogStatus('error') })
    return () => controller.abort()
  }, [apiFetch])

  const categories = useMemo(() => {
    const availableIds = new Set(giros.map((item) => Number(item.id_giro)))
    const groupedIds = new Set(CATEGORY_GROUPS.flatMap((category) => category.giros))
    const primary = CATEGORY_GROUPS.map((category) => ({ ...category, giros: category.giros.filter((id) => availableIds.has(id)) })).filter((category) => category.giros.length)
    const remaining = giros.map((item) => Number(item.id_giro)).filter((id) => !groupedIds.has(id))
    return remaining.length ? [...primary, { id: 'otros', label: 'Otros servicios', description: 'Más experiencias turísticas', icon: '✨', color: '#536b7c', giros: remaining }] : primary
  }, [giros])

  const categoryGiros = useMemo(() => {
    if (!selectedCategory) return []
    const allowed = new Set(selectedCategory.giros)
    const term = giroSearch.trim().toLocaleLowerCase('es-MX')
    return giros.filter((item) => allowed.has(Number(item.id_giro))).filter((item) => !term || `${cleanText(item.giro)} ${cleanText(item.resumen || '')}`.toLocaleLowerCase('es-MX').includes(term))
  }, [cleanText, giroSearch, giros, selectedCategory])

  useEffect(() => {
    if (!selectedGiro || view !== 'results') return undefined
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setResultStatus('loading')
      setResultMessage('')
      const query = new URLSearchParams({ giro: String(selectedGiro.id_giro), page: String(page), pageSize: '12' })
      if (placeSearch.trim()) query.set('busqueda', placeSearch.trim())
      apiFetch(`/api/directorio/establecimientos?${query}`, { signal: controller.signal })
        .then((response) => response.json())
        .then((payload) => { setResults(payload.data || { rows: [], total: 0, page: 1, pages: 1 }); setResultStatus('ready') })
        .catch((error) => { if (error.name !== 'AbortError') { setResultStatus('error'); setResultMessage(error.serverMessage || 'No fue posible consultar el directorio.') } })
    }, 250)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [apiFetch, page, placeSearch, selectedGiro, view])

  useEffect(() => { panelRef.current?.scrollTo({ top: 0, behavior: 'smooth' }) }, [view, selectedCategory, selectedGiro, selectedPlace])

  const openCategory = (category) => { setSelectedCategory(category); setGiroSearch(''); setView('giros') }
  const openGiro = (giro) => { setSelectedGiro(giro); setSelectedPlace(null); setPlaceSearch(''); setPage(1); setResults({ rows: [], total: 0, page: 1, pages: 1 }); setView('results') }
  const openDetail = (place) => { setSelectedPlace(place); setView('detail') }
  const returnToCategories = () => { setSelectedCategory(null); setSelectedGiro(null); setSelectedPlace(null); setView('categories') }
  const giroIcon = giroIcons[selectedGiro?.id_giro] || '📍'

  return <main className="public-directory" ref={panelRef}>
    <header className="directory-hero">
      <div><span className="eyebrow">Consulta ciudadana</span><h2>Descubre Guanajuato</h2><p>Encuentra experiencias y servicios turísticos registrados de forma rápida y visual.</p></div>
      <nav aria-label="Recursos de ayuda"><button type="button" onClick={() => onShowResource('Manual de usuario')}>Manual de usuario</button><button type="button" onClick={() => onShowResource('Preguntas frecuentes')}>Preguntas frecuentes</button></nav>
    </header>

    {view !== 'categories' && <nav className="directory-breadcrumb" aria-label="Navegación del directorio"><button type="button" onClick={returnToCategories}>Categorías</button>{selectedCategory && <><span>/</span><button type="button" onClick={() => setView('giros')}>{selectedCategory.label}</button></>}{selectedGiro && view !== 'giros' && <><span>/</span><button type="button" onClick={() => setView('results')}>{cleanText(selectedGiro.giro)}</button></>}{view === 'detail' && <><span>/</span><strong>{selectedPlace?.nombre_comercial}</strong></>}</nav>}

    {view === 'categories' && <section className="directory-view" aria-labelledby="directory-categories-title">
      <div className="directory-section-heading"><div><span>Explora por categoría</span><h3 id="directory-categories-title">¿Qué estás buscando?</h3></div><p>Selecciona una categoría para conocer los giros disponibles.</p></div>
      {catalogStatus === 'loading' && <div className="directory-state"><i className="directory-spinner" /><strong>Cargando categorías…</strong></div>}
      {catalogStatus === 'error' && <div className="directory-state error"><span>!</span><strong>No pudimos cargar las categorías</strong><p>Actualiza la página para intentar nuevamente.</p></div>}
      {catalogStatus === 'ready' && <div className="category-grid">{categories.map((category) => <button type="button" className="category-card" style={{ '--category-color': category.color }} onClick={() => openCategory(category)} key={category.id}><span className="category-icon" aria-hidden="true">{category.icon}</span><span><strong>{category.label}</strong><small>{category.description}</small><b>{category.giros.length} {category.giros.length === 1 ? 'giro' : 'giros'}</b></span><i aria-hidden="true">→</i></button>)}</div>}
    </section>}

    {view === 'giros' && <section className="directory-view" aria-labelledby="directory-giros-title">
      <button className="directory-back" type="button" onClick={returnToCategories}>← Volver a categorías</button>
      <div className="directory-section-heading"><div><span>{selectedCategory?.icon} {selectedCategory?.label}</span><h3 id="directory-giros-title">Selecciona un giro</h3></div><p>Consulta los servicios disponibles dentro de esta categoría.</p></div>
      <DirectorySearch value={giroSearch} onChange={setGiroSearch} label="Buscar giro" placeholder="Buscar giro o actividad turística…" />
      <div className="giro-list">{categoryGiros.map((giro) => <button type="button" onClick={() => openGiro(giro)} key={giro.id_giro}><span aria-hidden="true">{giroIcons[giro.id_giro] || selectedCategory?.icon || '📍'}</span><div><strong>{cleanText(giro.giro)}</strong><small>{cleanText(giro.resumen) || 'Consulta establecimientos de este giro.'}</small></div><i aria-hidden="true">→</i></button>)}</div>
      {!categoryGiros.length && <div className="directory-state"><span aria-hidden="true">⌕</span><strong>No encontramos giros</strong><p>Prueba con otra palabra.</p></div>}
    </section>}

    {view === 'results' && <section className="directory-view directory-results" aria-labelledby="directory-results-title">
      <button className="directory-back" type="button" onClick={() => setView('giros')}>← Cambiar giro</button>
      <div className="directory-section-heading"><div><span>{giroIcon} Directorio turístico</span><h3 id="directory-results-title">{cleanText(selectedGiro?.giro)}</h3></div><p>{results.total.toLocaleString('es-MX')} {results.total === 1 ? 'establecimiento encontrado' : 'establecimientos encontrados'}</p></div>
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
