import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react'

import './App.css'
import { supabase } from './supabase'
import {
  setGoogleAnalyticsEnabled,
  trackGooglePageView,
  trackInteraction,
  trackSiteEvent,
} from './analytics'

const COMPANY = {
  legalName: 'CAT COURIER SRL',
  brand: 'CAT Courier Auto',
  subtitle: 'Autoturisme & Autoutilitare',
  cui: 'RO16864100',
  registry: 'J2004000528511',
  email: '',
}

const PHONE_PRIMARY = '+40799600001'
const PHONE_PRIMARY_DISPLAY = '+40 799 600 001'
const PHONE_SECONDARY = '+40740457856'
const PHONE_SECONDARY_DISPLAY = '+40 740 457 856'
const WHATSAPP = '40799600001'
const VAT_RATE = 21
const ADDRESS = 'Str. Varianta Nord nr. 12E, Călărași, jud. Călărași, România'
const MAP_URL = 'https://www.google.com/maps/search/?api=1&query=Strada+Varianta+Nord+12E+Calarasi+Romania'
const SAL_URL = 'https://reclamatiisal.anpc.ro/'
const ANPC_URL = 'https://anpc.ro/'

const EMPTY_FORM = {
  vehicle_type: 'Autoutilitară',
  vin: '',
  first_registration_date: '',
  brand: '',
  model: '',
  year: '',
  month: '',
  km: '',
  price: '',
  currency: 'EUR',
  fuel: 'Diesel',
  gearbox: 'Manuală',
  power: '',
  engine: '',
  traction: 'Față',
  status: 'În stoc',
  description: '',
  featuresText: '',
  is_published: false,
  sort_order: 0,
}

function formatNumber(value) {
  if (value === null || value === undefined || value === '') return ''
  return Number(value).toLocaleString('ro-RO')
}

function formatKm(vehicle) {
  if (vehicle?.km === null || vehicle?.km === undefined || vehicle?.km === '') {
    return 'Kilometraj în curs de actualizare'
  }
  return `${formatNumber(vehicle.km)} km`
}

function currencySymbol(vehicle) {
  return vehicle?.currency === 'RON' ? 'lei' : '€'
}

function formatPrice(vehicle) {
  if (
    vehicle?.price === null ||
    vehicle?.price === undefined ||
    vehicle?.price === '' ||
    Number(vehicle.price) === 0
  ) {
    return 'Preț la cerere'
  }

  return `${formatNumber(vehicle.price)} ${currencySymbol(vehicle)} + TVA ${VAT_RATE}%`
}

function formatYear(vehicle) {
  if (!vehicle?.year) return '—'
  if (!vehicle.month) return String(vehicle.year)
  return `${String(vehicle.month).padStart(2, '0')}/${vehicle.year}`
}

function formatFirstRegistration(vehicle) {
  if (!vehicle?.first_registration_date) return 'În curs de actualizare'

  try {
    const date = new Date(`${vehicle.first_registration_date}T00:00:00`)
    return new Intl.DateTimeFormat('ro-RO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date)
  } catch {
    return vehicle.first_registration_date
  }
}

function vehicleTypeLabel(vehicle) {
  return vehicle?.vehicle_type === 'Autoturism' ? 'AUTOTURISM' : 'AUTOUTILITARĂ'
}

function getTwoHourBucket() {
  return Math.floor(Date.now() / (2 * 60 * 60 * 1000))
}

function getVisitorSeed() {
  const key = 'cat-auto-visitor-seed'

  try {
    let seed = localStorage.getItem(key)

    if (!seed) {
      seed =
        window.crypto && window.crypto.randomUUID
          ? window.crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`
      localStorage.setItem(key, seed)
    }

    return seed
  } catch {
    return `${Date.now()}-${Math.random()}`
  }
}

function hashString(value) {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

function statusPriority(status) {
  if (status === 'În stoc') return 0
  if (status === 'Rezervat') return 1
  return 2
}

function recommendedScore(vehicle, bucket, visitorSeed) {
  return hashString(`${visitorSeed}|${bucket}|${vehicle.id}`)
}

function slugify(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function safeFilename(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
}

function storagePathFromUrl(url) {
  if (!url) return null
  const marker = '/storage/v1/object/public/vehicle-images/'
  const index = url.indexOf(marker)
  if (index === -1) return null
  return decodeURIComponent(url.slice(index + marker.length))
}

function readRoute() {
  const hash = window.location.hash || '#/'
  const path = hash.replace(/^#/, '')

  if (path.startsWith('/duba/')) {
    return {
      page: 'vehicle',
      slug: decodeURIComponent(path.slice('/duba/'.length)),
    }
  }

  if (path === '/favorite') return { page: 'favorites' }
  if (path === '/admin') return { page: 'admin' }
  if (path === '/legal/confidentialitate') return { page: 'privacy' }
  if (path === '/legal/cookies') return { page: 'cookies' }
  if (path === '/legal/termeni') return { page: 'terms' }
  if (path === '/legal/date-companie') return { page: 'company' }

  return { page: 'home' }
}

function go(path) {
  window.location.hash = path
}

function goSection(id) {
  const route = readRoute()

  const scroll = () => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  if (route.page === 'home') {
    scroll()
    return
  }

  window.location.hash = '/'
  setTimeout(scroll, 150)
}

function statusClass(status) {
  if (status === 'Rezervat') return 'reserved'
  if (status === 'Vândut') return 'sold'
  return 'available'
}

function readCookiePreferences() {
  try {
    const stored = localStorage.getItem('cat-auto-cookie-consent')
    return stored ? JSON.parse(stored) : null
  } catch {
    return null
  }
}

function vehicleAnalyticsData(vehicle, location) {
  return {
    pageKey: vehicle ? 'vehicle' : undefined,
    vehicleId: vehicle?.id,
    vehicleSlug: vehicle?.slug,
    vehicleName: vehicle ? `${vehicle.brand || ''} ${vehicle.model || ''}`.trim() : undefined,
    location,
  }
}

function VehicleImage({ vehicle, src, className = '' }) {
  if (src) {
    return (
      <img
        src={src}
        alt={`${vehicle.brand || ''} ${vehicle.model || ''}`}
        className={className}
      />
    )
  }

  return (
    <div className={`imagePlaceholder ${className}`}>
      CAT
      <span>AUTO</span>
      <span>{vehicleTypeLabel(vehicle)}</span>
      <span>IMAGINE ORIENTATIVĂ</span>
    </div>
  )
}

function App() {
  const [route, setRoute] = useState(readRoute())
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [adminChecking, setAdminChecking] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [vehicles, setVehicles] = useState([])
  const [vehiclesLoading, setVehiclesLoading] = useState(true)
  const [vehiclesError, setVehiclesError] = useState('')
  const [favorites, setFavorites] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('cat-auto-favorites') || '[]')
    } catch {
      return []
    }
  })
  const [cookiePreferences, setCookiePreferences] = useState(readCookiePreferences)
  const [cookieSettingsOpen, setCookieSettingsOpen] = useState(false)

  const publicVehicles = vehicles.filter((vehicle) => vehicle.is_published === true)
  const favoriteVehicles = publicVehicles.filter((vehicle) => favorites.includes(vehicle.id))
  const selectedVehicle = vehicles.find((vehicle) => vehicle.slug === route.slug)
  const activeVehicle = route.page === 'vehicle' ? selectedVehicle : null

  useEffect(() => {
    const previousScrollRestoration = window.history.scrollRestoration

    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual'
    }

    const handleHash = () => setRoute(readRoute())
    window.addEventListener('hashchange', handleHash)

    return () => {
      window.removeEventListener('hashchange', handleHash)
      if ('scrollRestoration' in window.history) {
        window.history.scrollRestoration = previousScrollRestoration
      }
    }
  }, [])

  useLayoutEffect(() => {
    const scrollToTop = () => {
      window.scrollTo(0, 0)
      document.documentElement.scrollTop = 0
      document.body.scrollTop = 0
    }

    scrollToTop()
    const frame = window.requestAnimationFrame(scrollToTop)
    const timer = window.setTimeout(scrollToTop, 80)

    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [route.page, route.slug])

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setAuthLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setAuthLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let active = true

    const checkAdmin = async () => {
      if (!session) {
        setIsAdmin(false)
        setAdminChecking(false)
        return
      }

      setAdminChecking(true)
      const { data, error } = await supabase.rpc('is_admin')
      if (!active) return

      if (error) {
        console.error(error)
        setIsAdmin(false)
      } else {
        setIsAdmin(data === true)
      }

      setAdminChecking(false)
    }

    checkAdmin()
    return () => {
      active = false
    }
  }, [session])

  useEffect(() => {
    localStorage.setItem('cat-auto-favorites', JSON.stringify(favorites))
  }, [favorites])

  useEffect(() => {
    setGoogleAnalyticsEnabled(cookiePreferences?.analytics === true)
  }, [cookiePreferences?.analytics])

  useEffect(() => {
    if (route.page === 'admin') return
    if (route.page === 'vehicle' && !selectedVehicle) return

    const pageKey = route.page === 'vehicle' ? 'vehicle' : route.page

    trackSiteEvent('site_view', {
      pageKey,
      vehicleId: selectedVehicle?.id,
      vehicleSlug: selectedVehicle?.slug,
    })

    const title = selectedVehicle
      ? `${selectedVehicle.brand || ''} ${selectedVehicle.model || ''} | CAT Courier Auto`.trim()
      : `CAT Courier Auto | ${pageKey}`

    trackGooglePageView({ pageTitle: title })
  }, [route.page, route.slug, selectedVehicle?.id, cookiePreferences?.analytics])

  const loadVehicles = useCallback(async () => {
    setVehiclesLoading(true)
    setVehiclesError('')

    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })

    if (error) {
      console.error(error)
      setVehiclesError('Nu am putut încărca stocul.')
      setVehicles([])
    } else {
      setVehicles(data || [])
    }

    setVehiclesLoading(false)
  }, [])

  useEffect(() => {
    if (authLoading) return
    loadVehicles()
  }, [authLoading, session?.user?.id, isAdmin, loadVehicles])

  const toggleFavorite = (id) => {
    const adding = !favorites.includes(id)
    const vehicle = vehicles.find((item) => item.id === id)

    if (adding) {
      trackInteraction('favorite_add', {
        pageKey: route.page === 'vehicle' ? 'vehicle' : route.page,
        vehicleId: vehicle?.id,
        vehicleSlug: vehicle?.slug,
        vehicleName: vehicle ? `${vehicle.brand || ''} ${vehicle.model || ''}`.trim() : undefined,
        location: route.page,
      })
    }

    setFavorites((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  }

  const saveCookiePreferences = (preferences) => {
    localStorage.setItem('cat-auto-cookie-consent', JSON.stringify(preferences))
    setCookiePreferences(preferences)
    setCookieSettingsOpen(false)
  }

  return (
    <div className="app">
      <GlobalStyles />

      <Header favoriteCount={favorites.length} activeVehicle={activeVehicle} />

      <main>
        {route.page === 'home' && (
          <HomePage
            vehicles={publicVehicles}
            favorites={favorites}
            toggleFavorite={toggleFavorite}
            loading={vehiclesLoading}
            error={vehiclesError}
          />
        )}

        {route.page === 'favorites' && (
          <FavoritesPage
            vehicles={favoriteVehicles}
            favorites={favorites}
            toggleFavorite={toggleFavorite}
          />
        )}

        {route.page === 'vehicle' && (
          <VehiclePage
            vehicle={selectedVehicle}
            favorites={favorites}
            toggleFavorite={toggleFavorite}
          />
        )}

        {route.page === 'privacy' && <PrivacyPage />}
        {route.page === 'cookies' && <CookiesPage />}
        {route.page === 'terms' && <TermsPage />}
        {route.page === 'company' && <CompanyPage />}

        {route.page === 'admin' && (
          <AdminPage
            session={session}
            authLoading={authLoading}
            adminChecking={adminChecking}
            isAdmin={isAdmin}
            vehicles={vehicles}
            refreshVehicles={loadVehicles}
          />
        )}
      </main>

      {route.page !== 'admin' && (
        <Footer
          activeVehicle={activeVehicle}
          onCookieSettings={() => setCookieSettingsOpen(true)}
        />
      )}

      <CookieConsent
        preferences={cookiePreferences}
        settingsOpen={cookieSettingsOpen}
        setSettingsOpen={setCookieSettingsOpen}
        savePreferences={saveCookiePreferences}
      />
    </div>
  )
}

function GlobalStyles() {
  return (
    <style>
      {`
        .galleryMain.vehicleGalleryMain {
          position: relative;
          width: 100%;
          height: min(70vh, 720px);
          min-height: 460px;
          aspect-ratio: auto !important;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(180deg, #f7f8fa 0%, #eceff3 100%);
        }

        .galleryMain.vehicleGalleryMain > img.vehicleGalleryImage {
          width: 100% !important;
          height: 100% !important;
          max-width: 100% !important;
          max-height: 100% !important;
          display: block;
          object-fit: contain !important;
          object-position: center !important;
        }

        .galleryMain.vehicleGalleryMain .imagePlaceholder.vehicleGalleryImage {
          width: 100%;
          height: 100%;
        }

        .vehicleGalleryControls {
          position: absolute;
          left: 50%;
          bottom: 18px;
          transform: translateX(-50%);
          display: flex;
          align-items: center;
          gap: 8px;
          z-index: 12;
          padding: 5px;
          border-radius: 999px;
          background: rgba(5, 18, 38, 0.20);
          backdrop-filter: blur(7px);
          -webkit-backdrop-filter: blur(7px);
        }

        .vehicleGalleryArrow {
          width: 46px;
          height: 46px;
          padding: 0;
          margin: 0;
          border-radius: 50%;
          border: 1px solid rgba(255, 255, 255, 0.40);
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(7, 23, 47, 0.40);
          color: white;
          font-size: 32px;
          font-weight: 300;
          line-height: 1;
          cursor: pointer;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
          transition: background .18s ease, transform .18s ease;
        }

        .vehicleGalleryArrow:hover {
          background: rgba(7, 23, 47, 0.70);
          transform: scale(1.05);
        }

        .vehicleGalleryArrow:active { transform: scale(.93); }

        .vehicleGalleryCounter {
          min-width: 58px;
          height: 34px;
          padding: 0 10px;
          border-radius: 999px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(7, 23, 47, 0.50);
          color: white;
          font-size: 13px;
          font-weight: 700;
        }

        .galleryThumbs {
          overflow-x: auto;
          overflow-y: auto;
          scroll-behavior: smooth;
          scrollbar-width: thin;
        }

        .analyticsPanel {
          margin: 28px 0 34px;
          padding: 24px;
          border-radius: 24px;
          background: #0b1c36;
          color: #fff;
          box-shadow: 0 18px 45px rgba(11, 28, 54, .18);
        }

        .analyticsTop {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 18px;
          margin-bottom: 20px;
        }

        .analyticsTop h2 { margin: 4px 0 0; color: #fff; }

        .analyticsRange {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .analyticsRange button,
        .analyticsRefresh {
          border: 1px solid rgba(255,255,255,.18);
          background: rgba(255,255,255,.08);
          color: #fff;
          border-radius: 999px;
          padding: 9px 13px;
          cursor: pointer;
          font-weight: 700;
        }

        .analyticsRange button.active {
          background: #f26722;
          border-color: #f26722;
        }

        .analyticsKpis {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 22px;
        }

        .analyticsKpi {
          min-height: 96px;
          padding: 15px;
          border-radius: 16px;
          background: rgba(255,255,255,.08);
          border: 1px solid rgba(255,255,255,.08);
        }

        .analyticsKpi span {
          display: block;
          color: rgba(255,255,255,.68);
          font-size: 12px;
          margin-bottom: 8px;
        }

        .analyticsKpi strong {
          font-size: 25px;
          line-height: 1;
          color: #fff;
        }

        .analyticsGrid {
          display: grid;
          grid-template-columns: minmax(0, 2fr) minmax(260px, 1fr);
          gap: 18px;
        }

        .analyticsCard {
          background: #fff;
          color: #172033;
          border-radius: 18px;
          padding: 18px;
          overflow: hidden;
        }

        .analyticsCard h3 { margin: 0 0 14px; }

        .analyticsTableWrap { overflow-x: auto; }

        .analyticsTable {
          width: 100%;
          border-collapse: collapse;
          min-width: 760px;
        }

        .analyticsTable th,
        .analyticsTable td {
          padding: 11px 9px;
          border-bottom: 1px solid #edf0f4;
          text-align: right;
          white-space: nowrap;
        }

        .analyticsTable th:first-child,
        .analyticsTable td:first-child { text-align: left; }

        .analyticsTable th {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: .05em;
          color: #718096;
        }

        .analyticsVehicleName {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .analyticsVehicleName small { color: #8792a6; }

        .interestBadge {
          display: inline-flex;
          min-width: 52px;
          justify-content: center;
          padding: 6px 9px;
          border-radius: 999px;
          background: #fff2e9;
          color: #d7530a;
          font-weight: 800;
        }

        .analyticsList {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .analyticsListRow {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 12px;
          align-items: center;
        }

        .analyticsListRow > div:first-child {
          min-width: 0;
        }

        .analyticsBarTrack {
          height: 7px;
          border-radius: 999px;
          background: #eef1f5;
          overflow: hidden;
          margin-top: 5px;
        }

        .analyticsBarFill {
          height: 100%;
          border-radius: inherit;
          background: #f26722;
        }

        .analyticsMuted { color: #7c8798; font-size: 13px; }
        .analyticsError { margin-top: 12px; color: #ffd3c2; }

        @media (max-width: 1100px) {
          .analyticsKpis { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .analyticsGrid { grid-template-columns: 1fr; }
        }

        @media (max-width: 700px) {
          .galleryMain.vehicleGalleryMain {
            height: 55vh;
            min-height: 330px;
            max-height: 520px;
          }

          .vehicleGalleryControls { bottom: 12px; padding: 4px; gap: 6px; }
          .vehicleGalleryArrow { width: 42px; height: 42px; font-size: 29px; }
          .vehicleGalleryCounter { min-width: 50px; height: 31px; padding: 0 8px; font-size: 12px; }

          .analyticsPanel { padding: 16px; border-radius: 18px; }
          .analyticsTop { flex-direction: column; }
          .analyticsKpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }

        @media (max-width: 430px) {
          .galleryMain.vehicleGalleryMain {
            height: 48vh;
            min-height: 290px;
            max-height: 450px;
          }
        }
      `}
    </style>
  )
}

function Header({ favoriteCount, activeVehicle }) {
  const analytics = vehicleAnalyticsData(activeVehicle, 'header')

  return (
    <header className="header">
      <button
        className="brandButton"
        onClick={() => {
          go('/')
          setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50)
        }}
      >
        <img src="/cat-courier-orizontal-2000.png" alt="CAT Courier" className="headerLogo" />
        <div className="brandDivider" />
        <div className="brandAuto">
          <strong>Auto</strong>
          <span>Autoturisme & Autoutilitare</span>
        </div>
      </button>

      <nav>
        <button onClick={() => goSection('stoc')}>Stoc</button>
        <button onClick={() => goSection('despre')}>Despre noi</button>
        <button onClick={() => goSection('contact')}>Contact</button>
      </nav>

      <div className="headerRight">
        <div className="headerPhones">
          <a
            href={`tel:${PHONE_PRIMARY}`}
            className="headerPrimaryPhone"
            onClick={() => trackInteraction('phone_click', analytics)}
          >
            ☎ {PHONE_PRIMARY_DISPLAY}
          </a>

          <a
            href={`tel:${PHONE_SECONDARY}`}
            onClick={() => trackInteraction('phone_click', { ...analytics, location: 'header_secondary' })}
          >
            {PHONE_SECONDARY_DISPLAY}
          </a>
        </div>

        <button className="favoriteNav" onClick={() => go('/favorite')} aria-label="Favorite">
          ♡
          {favoriteCount > 0 && <span>{favoriteCount}</span>}
        </button>
      </div>
    </header>
  )
}

function HomePage({ vehicles, favorites, toggleFavorite, loading, error }) {
  const [search, setSearch] = useState('')
  const [vehicleType, setVehicleType] = useState('Toate')
  const [brand, setBrand] = useState('Toate')
  const [status, setStatus] = useState('Toate')
  const [minYear, setMinYear] = useState('')
  const [maxKm, setMaxKm] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [sortBy, setSortBy] = useState('recommended')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [rotationBucket, setRotationBucket] = useState(getTwoHourBucket)
  const [visitorSeed] = useState(getVisitorSeed)

  useEffect(() => {
    const interval = window.setInterval(() => {
      const current = getTwoHourBucket()
      setRotationBucket((previous) => (previous === current ? previous : current))
    }, 60000)

    return () => window.clearInterval(interval)
  }, [])

  const brands = ['Toate', ...new Set(vehicles.map((vehicle) => vehicle.brand).filter(Boolean))]

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()

    let result = vehicles.filter((vehicle) => {
      const searchable = `${vehicle.brand || ''} ${vehicle.model || ''} ${vehicle.engine || ''} ${vehicle.vin || ''} ${vehicle.vehicle_type || ''}`.toLowerCase()

      const matchesSearch = !q || searchable.includes(q)
      const matchesType = vehicleType === 'Toate' || vehicle.vehicle_type === vehicleType
      const matchesBrand = brand === 'Toate' || vehicle.brand === brand
      const matchesStatus = status === 'Toate' || vehicle.status === status
      const matchesYear = !minYear || Number(vehicle.year) >= Number(minYear)
      const matchesKm = !maxKm || vehicle.km === null || vehicle.km === undefined || Number(vehicle.km) <= Number(maxKm)
      const matchesPrice = !maxPrice || vehicle.price === null || vehicle.price === undefined || Number(vehicle.price) <= Number(maxPrice)

      return matchesSearch && matchesType && matchesBrand && matchesStatus && matchesYear && matchesKm && matchesPrice
    })

    if (sortBy === 'recommended') {
      result = [...result].sort((a, b) => {
        const statusDiff = statusPriority(a.status) - statusPriority(b.status)
        if (statusDiff !== 0) return statusDiff
        return recommendedScore(a, rotationBucket, visitorSeed) - recommendedScore(b, rotationBucket, visitorSeed)
      })
    }

    if (sortBy === 'priceAsc') {
      result = [...result].sort((a, b) => {
        if (a.price === null || a.price === undefined) return 1
        if (b.price === null || b.price === undefined) return -1
        return Number(a.price) - Number(b.price)
      })
    }

    if (sortBy === 'priceDesc') {
      result = [...result].sort((a, b) => {
        if (a.price === null || a.price === undefined) return 1
        if (b.price === null || b.price === undefined) return -1
        return Number(b.price) - Number(a.price)
      })
    }

    if (sortBy === 'yearDesc') {
      result = [...result].sort((a, b) => Number(b.year || 0) - Number(a.year || 0))
    }

    if (sortBy === 'kmAsc') {
      result = [...result].sort((a, b) => {
        if (a.km === null || a.km === undefined) return 1
        if (b.km === null || b.km === undefined) return -1
        return Number(a.km) - Number(b.km)
      })
    }

    return result
  }, [vehicles, search, vehicleType, brand, status, minYear, maxKm, maxPrice, sortBy, rotationBucket, visitorSeed])

  const clearFilters = () => {
    setSearch('')
    setVehicleType('Toate')
    setBrand('Toate')
    setStatus('Toate')
    setMinYear('')
    setMaxKm('')
    setMaxPrice('')
    setSortBy('recommended')
  }

  const availableCount = vehicles.filter((vehicle) => vehicle.status === 'În stoc').length
  const carsCount = vehicles.filter((vehicle) => vehicle.vehicle_type === 'Autoturism').length
  const vansCount = vehicles.filter((vehicle) => vehicle.vehicle_type === 'Autoutilitară').length

  return (
    <>
      <section className="hero">
        <div className="heroOverlay" />
        <img src="/cat-courier-simbol-512.png" alt="" className="heroBrandMark" />

        <div className="heroContent">
          <span className="heroEyebrow">CAT COURIER AUTO</span>
          <h1>CAT Courier<span> Auto</span></h1>
          <h2>Vehicule pentru drum. Soluții pentru afaceri.</h2>
          <p>Autoturisme și autoutilitare rulate, cu informații clare, fotografii reale imediat ce sunt disponibile și contact direct.</p>

          <div className="heroActions">
            <a
              href={`tel:${PHONE_PRIMARY}`}
              className="heroPrimaryButton"
              onClick={() => trackInteraction('phone_click', { pageKey: 'home', location: 'hero' })}
            >
              ☎ Sună acum
            </a>

            <a
              href={`https://wa.me/${WHATSAPP}`}
              target="_blank"
              rel="noreferrer"
              className="heroWhatsappButton"
              onClick={() => trackInteraction('whatsapp_click', { pageKey: 'home', location: 'hero' })}
            >
              WhatsApp
            </a>
          </div>
        </div>

        <div className="heroInfoBar">
          <div><span className="heroInfoIcon">AUTO</span><div><strong>{carsCount} autoturisme</strong><span>Stoc actual</span></div></div>
          <div><span className="heroInfoIcon">VAN</span><div><strong>{vansCount} autoutilitare</strong><span>Stoc actual</span></div></div>
          <div><span className="heroInfoIcon">●</span><div><strong>Călărași</strong><span>Varianta Nord 12E</span></div></div>
          <div><span className="heroInfoIcon">✓</span><div><strong>{availableCount} în stoc</strong><span>Vehicule disponibile</span></div></div>
        </div>
      </section>

      <section className="inventory" id="stoc">
        <div className="sectionHeading">
          <div><span className="sectionLabel">STOC ACTUAL</span><h2>Vehicule disponibile</h2></div>
          <button className="filterToggle" onClick={() => setShowAdvanced((current) => !current)}>
            {showAdvanced ? 'Închide filtrele ×' : 'Filtrează stocul'}
          </button>
        </div>

        <div className="vehicleTypeFilters">
          {['Toate', 'Autoturism', 'Autoutilitară'].map((item) => (
            <button
              key={item}
              className={vehicleType === item ? 'active' : ''}
              onClick={() => setVehicleType(item)}
            >
              {item === 'Autoturism' ? 'Autoturisme' : item === 'Autoutilitară' ? 'Autoutilitare' : 'Toate'}
            </button>
          ))}
        </div>

        <div className="searchPanel">
          <div className="searchField">
            <span>Caută</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Marcă, model, motor sau VIN..." />
          </div>

          <div className="quickBrands">
            {brands.map((item) => (
              <button key={item} className={brand === item ? 'active' : ''} onClick={() => setBrand(item)}>{item}</button>
            ))}
          </div>
        </div>

        <div className="statusFilters">
          {['Toate', 'În stoc', 'Rezervat', 'Vândut'].map((item) => (
            <button key={item} className={status === item ? 'active' : ''} onClick={() => setStatus(item)}>{item}</button>
          ))}
        </div>

        {showAdvanced && (
          <div className="advancedFilters">
            <div className="advancedHeader">
              <div><span className="sectionLabel">FILTRARE AVANSATĂ</span><h3>Găsește vehiculul potrivit</h3></div>
              <button onClick={clearFilters}>Resetează</button>
            </div>

            <div className="advancedGrid">
              <label><span>An minim</span><input type="number" value={minYear} onChange={(e) => setMinYear(e.target.value)} placeholder="2018" /></label>
              <label><span>Km maxim</span><input type="number" value={maxKm} onChange={(e) => setMaxKm(e.target.value)} placeholder="180000" /></label>
              <label><span>Preț fără TVA maxim</span><input type="number" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="25000" /></label>
              <label>
                <span>Sortare</span>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                  <option value="recommended">Recomandate</option>
                  <option value="priceAsc">Preț crescător</option>
                  <option value="priceDesc">Preț descrescător</option>
                  <option value="yearDesc">Cele mai noi</option>
                  <option value="kmAsc">Cei mai puțini km</option>
                </select>
              </label>
            </div>
          </div>
        )}

        <div className="resultsBar">
          <span><strong>{filtered.length}</strong> {filtered.length === 1 ? 'vehicul' : 'vehicule'}</span>
          {(search || vehicleType !== 'Toate' || brand !== 'Toate' || status !== 'Toate' || minYear || maxKm || maxPrice) && (
            <button onClick={clearFilters}>Șterge filtrele</button>
          )}
        </div>

        {error && <div className="errorNotice">{error}</div>}

        {loading ? (
          <div className="loadingBox">Se încarcă stocul...</div>
        ) : filtered.length > 0 ? (
          <VehicleGrid vehicles={filtered} favorites={favorites} toggleFavorite={toggleFavorite} />
        ) : (
          <div className="emptyState">
            <strong>Stocul este în curs de actualizare.</strong>
            <p>Pentru disponibilitatea actuală ne poți contacta direct.</p>
            <a href={`tel:${PHONE_PRIMARY}`} onClick={() => trackInteraction('phone_click', { pageKey: 'home', location: 'empty_state' })}>{PHONE_PRIMARY_DISPLAY}</a>
          </div>
        )}
      </section>

      <section className="aboutPremium" id="despre">
        <div className="aboutPremiumIntro">
          <span className="sectionLabel">CAT COURIER AUTO</span>
          <h2>Mașini pentru oameni.<br />Vehicule pentru afaceri.</h2>
          <p>CAT Courier Auto este divizia dedicată autoturismelor și autoutilitarelor rulate.</p>
        </div>

        <div className="aboutPremiumItems">
          <PremiumItem number="01" title="Informații clare">Preț, kilometraj, specificații și fotografii prezentate transparent.</PremiumItem>
          <PremiumItem number="02" title="Contact direct">Vorbești direct cu noi prin telefon sau WhatsApp.</PremiumItem>
          <PremiumItem number="03" title="Parc auto în Călărași">Ne găsești pe Strada Varianta Nord nr. 12E.</PremiumItem>
        </div>
      </section>

      <LocationSection />
      <LegalHomeNotice />
      <ContactSection />
    </>
  )
}

function PremiumItem({ number, title, children }) {
  return <div className="premiumItem"><span className="premiumNumber">{number}</span><div><h3>{title}</h3><p>{children}</p></div></div>
}

function VehicleGrid({ vehicles, favorites, toggleFavorite }) {
  return (
    <div className="grid">
      {vehicles.map((vehicle) => (
        <article className="card" key={vehicle.id}>
          <button className="cardImageButton" onClick={() => go(`/duba/${vehicle.slug}`)}>
            <div className="imageWrap">
              <VehicleImage vehicle={vehicle} src={vehicle.images?.length > 0 ? vehicle.images[0] : null} />
              <span className="year">{formatYear(vehicle)}</span>
              <span className="vehicleTypeBadge">{vehicleTypeLabel(vehicle)}</span>
              <span className={`cardStatus ${statusClass(vehicle.status)}`}>{vehicle.status}</span>
            </div>
          </button>

          <button
            className={`favorite ${favorites.includes(vehicle.id) ? 'selected' : ''}`}
            onClick={() => toggleFavorite(vehicle.id)}
            aria-label="Favorite"
          >
            {favorites.includes(vehicle.id) ? '♥' : '♡'}
          </button>

          <div className="cardBody">
            <div className="brand">{vehicle.brand}</div>
            <h3>{vehicle.model}</h3>

            <div className="specs">
              <span>{formatKm(vehicle)}</span>
              {vehicle.fuel && <span>{vehicle.fuel}</span>}
              {vehicle.gearbox && <span>{vehicle.gearbox}</span>}
              {vehicle.power && <span>{vehicle.power}</span>}
            </div>

            <div className="cardFooter">
              <div><small>Preț</small><strong>{formatPrice(vehicle)}</strong></div>
              <button className="details" onClick={() => go(`/duba/${vehicle.slug}`)}>Detalii →</button>
            </div>
          </div>
        </article>
      ))}
    </div>
  )
}

function VehiclePage({ vehicle, favorites, toggleFavorite }) {
  const [activeImage, setActiveImage] = useState(0)

  useEffect(() => {
    setActiveImage(0)
  }, [vehicle?.id])

  useEffect(() => {
    if (!vehicle) return
    trackInteraction('vehicle_view', vehicleAnalyticsData(vehicle, 'vehicle_page'))
  }, [vehicle?.id, vehicle?.slug])

  if (!vehicle) {
    return (
      <section className="notFound">
        <span className="sectionLabel">CAT COURIER AUTO</span>
        <h1>Vehiculul nu a fost găsit.</h1>
        <button onClick={() => go('/')}>Înapoi la stoc</button>
      </section>
    )
  }

  const images = vehicle.images || []
  const features = vehicle.features || []
  const hasMultipleImages = images.length > 1
  const analytics = vehicleAnalyticsData(vehicle, 'vehicle_page')

  const previousImage = () => {
    if (!hasMultipleImages) return
    setActiveImage((current) => (current === 0 ? images.length - 1 : current - 1))
    trackInteraction('gallery_prev', { ...analytics, location: 'gallery' })
  }

  const nextImage = () => {
    if (!hasMultipleImages) return
    setActiveImage((current) => (current === images.length - 1 ? 0 : current + 1))
    trackInteraction('gallery_next', { ...analytics, location: 'gallery' })
  }

  const whatsappMessage = encodeURIComponent(
    `Bună ziua! Sunt interesat de ${vehicle.brand} ${vehicle.model}${vehicle.vin ? `, VIN ${vehicle.vin}` : ''}.`,
  )

  return (
    <section className="vehiclePage">
      <button className="backButton" onClick={() => go('/')}>← Înapoi la stoc</button>

      <div className="vehicleTop">
        <div>
          <div className="vehicleTypeHeading">{vehicleTypeLabel(vehicle)}</div>
          <div className="vehicleBrand">{vehicle.brand}</div>
          <h1>{vehicle.model}</h1>
          <div className="vehicleSubtitle">
            {vehicle.year && <><span>{formatYear(vehicle)}</span><b>•</b></>}
            <span>{formatKm(vehicle)}</span>
            {vehicle.fuel && <><b>•</b><span>{vehicle.fuel}</span></>}
          </div>
        </div>

        <div className="vehiclePriceBox"><small>Preț</small><strong>{formatPrice(vehicle)}</strong></div>
      </div>

      <div className="gallery">
        <div className="galleryMain vehicleGalleryMain">
          {images.length > 0 ? (
            <VehicleImage vehicle={vehicle} src={images[activeImage] || images[0]} className="vehicleGalleryImage" />
          ) : (
            <VehicleImage vehicle={vehicle} className="large vehicleGalleryImage" />
          )}

          <span className={`stockBadge ${statusClass(vehicle.status)}`}>{vehicle.status}</span>

          <button
            className={`detailFavorite ${favorites.includes(vehicle.id) ? 'selected' : ''}`}
            onClick={() => toggleFavorite(vehicle.id)}
            aria-label="Favorite"
          >
            {favorites.includes(vehicle.id) ? '♥' : '♡'}
          </button>

          {hasMultipleImages && (
            <div className="vehicleGalleryControls">
              <button type="button" className="vehicleGalleryArrow" onClick={previousImage} aria-label="Fotografia anterioară">‹</button>
              <span className="vehicleGalleryCounter">{activeImage + 1} / {images.length}</span>
              <button type="button" className="vehicleGalleryArrow" onClick={nextImage} aria-label="Fotografia următoare">›</button>
            </div>
          )}
        </div>

        {images.length > 1 && (
          <div className="galleryThumbs">
            {images.map((image, index) => (
              <button
                key={`${image}-${index}`}
                type="button"
                className={`thumb ${activeImage === index ? 'activeThumb' : ''}`}
                onClick={() => setActiveImage(index)}
              >
                <img src={image} alt={`${vehicle.brand} ${vehicle.model} fotografie ${index + 1}`} />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="vehicleContent">
        <div>
          <section className="infoSection">
            <span className="sectionLabel">SPECIFICAȚII</span>
            <h2>Date principale</h2>
            <div className="specGrid">
              <Spec label="Categorie" value={vehicle.vehicle_type || 'Autoutilitară'} />
              <Spec label="An model" value={vehicle.year ? formatYear(vehicle) : 'În curs de actualizare'} />
              <Spec label="Prima înmatriculare" value={formatFirstRegistration(vehicle)} />
              <Spec label="Kilometraj" value={formatKm(vehicle)} />
              <Spec label="Motor" value={vehicle.engine || 'În curs de actualizare'} />
              <Spec label="Putere" value={vehicle.power || 'În curs de actualizare'} />
              <Spec label="Cutie" value={vehicle.gearbox || 'În curs de actualizare'} />
              <Spec label="Tracțiune" value={vehicle.traction || 'În curs de actualizare'} />
              <Spec label="Combustibil" value={vehicle.fuel || 'În curs de actualizare'} />
              <Spec label="VIN" value={vehicle.vin || 'În curs de actualizare'} />
            </div>
          </section>

          <section className="infoSection">
            <span className="sectionLabel">DESCRIERE</span>
            <h2>Despre vehicul</h2>
            <p className="description">{vehicle.description || 'Contactează CAT Courier Auto pentru toate detaliile acestui vehicul.'}</p>
          </section>

          {features.length > 0 && (
            <section className="infoSection">
              <span className="sectionLabel">DOTĂRI</span>
              <h2>Echipare</h2>
              <div className="featureGrid">
                {features.map((feature) => <div className="feature" key={feature}><span>✓</span>{feature}</div>)}
              </div>
            </section>
          )}

          <WarrantyNotice />
        </div>

        <aside className="contactCard">
          <span className="sectionLabel">CAT COURIER AUTO</span>
          <h3>Cere toate detaliile</h3>
          <p>Fotografii suplimentare, informații și programarea unei vizionări.</p>
          <div className="contactPrice"><small>Preț</small><strong>{formatPrice(vehicle)}</strong></div>

          <a
            className="primaryContact"
            href={`tel:${PHONE_PRIMARY}`}
            onClick={() => trackInteraction('phone_click', { ...analytics, location: 'vehicle_contact_primary' })}
          >
            ☎ {PHONE_PRIMARY_DISPLAY}
          </a>

          <a
            className="secondaryContact"
            href={`https://wa.me/${WHATSAPP}?text=${whatsappMessage}`}
            target="_blank"
            rel="noreferrer"
            onClick={() => trackInteraction('whatsapp_click', { ...analytics, location: 'vehicle_contact' })}
          >
            WhatsApp
          </a>

          <a
            className="thirdContact"
            href={`tel:${PHONE_SECONDARY}`}
            onClick={() => trackInteraction('phone_click', { ...analytics, location: 'vehicle_contact_secondary' })}
          >
            {PHONE_SECONDARY_DISPLAY}
          </a>
        </aside>
      </div>
    </section>
  )
}

function WarrantyNotice() {
  return (
    <section className="warrantyNotice">
      <div className="warrantyIcon">i</div>
      <div>
        <strong>Garanție comercială</strong>
        <p>Nu se oferă o garanție comercială suplimentară. Pentru cumpărătorii care au calitatea de consumator rămân aplicabile drepturile legale privind conformitatea bunurilor, în condițiile legislației în vigoare.</p>
      </div>
    </section>
  )
}

function Spec({ label, value }) {
  return <div><span>{label}</span><strong>{value}</strong></div>
}

function FavoritesPage({ vehicles, favorites, toggleFavorite }) {
  return (
    <section className="favoritesPage">
      <button className="backButton" onClick={() => go('/')}>← Înapoi</button>
      <span className="sectionLabel">FAVORITE</span>
      <h1>Vehicule salvate</h1>

      {vehicles.length > 0 ? (
        <VehicleGrid vehicles={vehicles} favorites={favorites} toggleFavorite={toggleFavorite} />
      ) : (
        <div className="emptyState">
          <strong>Nu ai favorite.</strong>
          <p>Apasă ♡ la un vehicul pentru a-l salva.</p>
          <button onClick={() => go('/')}>Vezi stocul</button>
        </div>
      )}
    </section>
  )
}

function LocationSection() {
  return (
    <section className="locationSection">
      <div>
        <span className="sectionLabel">PARC AUTO</span>
        <h2>Ne găsești în Călărași</h2>
        <p>{ADDRESS}</p>
        <a
          href={MAP_URL}
          target="_blank"
          rel="noreferrer"
          onClick={() => trackInteraction('maps_click', { pageKey: 'home', location: 'location_section' })}
        >
          Deschide în Google Maps →
        </a>
      </div>

      <div className="locationCard">
        <img src="/cat-courier-simbol-512.png" alt="CAT Courier" />
        <strong>CAT Courier Auto</strong>
        <span>Autoturisme & Autoutilitare</span>
        <p>Varianta Nord nr. 12E<br />Călărași</p>
      </div>
    </section>
  )
}

function LegalHomeNotice() {
  return (
    <section className="legalHomeNotice">
      <div>
        <span className="sectionLabel">INFORMAȚII PENTRU CONSUMATORI</span>
        <h2>Cumpără informat.</h2>
        <p>Informațiile juridice, confidențialitatea, politica de cookies și condițiile de vânzare sunt disponibile permanent pe site.</p>
      </div>

      <a className="salFallback" href={SAL_URL} target="_blank" rel="noreferrer">
        <span>ANPC</span><strong>SAL</strong><small>Soluționarea alternativă a litigiilor</small>
      </a>
    </section>
  )
}

function ContactSection() {
  return (
    <section className="contact" id="contact">
      <span className="contactEyebrow">CONTACT DIRECT</span>
      <h2>Hai să vorbim.</h2>
      <p>Pentru stoc, vizionări și informații despre vehicule.</p>

      <div className="contactActions">
        <a href={`tel:${PHONE_PRIMARY}`} className="contactPrimary" onClick={() => trackInteraction('phone_click', { pageKey: 'home', location: 'contact_section' })}>☎ {PHONE_PRIMARY_DISPLAY}</a>
        <a href={`https://wa.me/${WHATSAPP}`} target="_blank" rel="noreferrer" className="contactWhatsapp" onClick={() => trackInteraction('whatsapp_click', { pageKey: 'home', location: 'contact_section' })}>WhatsApp</a>
        <a href={`tel:${PHONE_SECONDARY}`} className="contactSecondary" onClick={() => trackInteraction('phone_click', { pageKey: 'home', location: 'contact_section_secondary' })}>{PHONE_SECONDARY_DISPLAY}</a>
      </div>

      <div className="contactAddress">{ADDRESS}</div>
    </section>
  )
}

function LegalLayout({ title, eyebrow, children }) {
  return (
    <section className="legalPage">
      <button className="backButton" onClick={() => go('/')}>← Înapoi la site</button>
      <span className="sectionLabel">{eyebrow}</span>
      <h1>{title}</h1>
      <div className="legalContent">{children}</div>
    </section>
  )
}

function PrivacyPage() {
  return (
    <LegalLayout eyebrow="GDPR" title="Politica de confidențialitate">
      <h2>Operatorul de date</h2>
      <p>Operatorul acestui site este <strong>{COMPANY.legalName}</strong>, CUI <strong>{COMPANY.cui}</strong>, nr. Reg. Com. <strong>{COMPANY.registry}</strong>, cu sediul la {ADDRESS}.</p>

      <h2>Date prelucrate</h2>
      <p>Site-ul public nu conține în prezent un formular prin care să colecteze direct date personale. Dacă alegi să ne contactezi prin telefon sau WhatsApp, putem prelucra datele pe care ni le comunici pentru a răspunde solicitării tale.</p>

      <h2>Măsurare agregată a traficului</h2>
      <p>Pentru statistica de bază a site-ului folosim un sistem propriu care numără agregat accesările și anumite interacțiuni, precum deschiderea unui vehicul, clickurile pe telefon, WhatsApp, favorite sau navigarea prin fotografii. Acest sistem nu creează un profil individual de vizitator și nu stochează în baza noastră un identificator de utilizator, nume, email sau fingerprint.</p>

      <h2>Google Analytics</h2>
      <p>Google Analytics 4 este activat numai dacă alegi categoria „Analiză” din preferințele de cookies. Dacă nu accepți această categorie, tag-ul Google Analytics nu este încărcat de site.</p>

      <h2>Favorite și preferințe</h2>
      <p>Favoritele și preferințele privind cookie-urile sunt memorate local în browserul utilizatorului.</p>

      <h2>Drepturile tale</h2>
      <p>În condițiile legislației privind protecția datelor poți solicita, după caz, acces, rectificare, ștergere, restricționare, opoziție sau portabilitate.</p>

      <h2>Contact</h2>
      <p>Ne poți contacta la <a href={`tel:${PHONE_PRIMARY}`}>{PHONE_PRIMARY_DISPLAY}</a> sau prin corespondență la sediul companiei.</p>
    </LegalLayout>
  )
}

function CookiesPage() {
  return (
    <LegalLayout eyebrow="COOKIES" title="Politica de cookies">
      <h2>Tehnologii necesare</h2>
      <p>Site-ul utilizează stocare locală pentru funcții precum favoritele, preferințele de cookies și zona de administrare.</p>

      <h2>Măsurare agregată proprie</h2>
      <p>Separat de Google Analytics, site-ul poate înregistra agregat accesări și interacțiuni tehnice pentru a înțelege interesul față de vehicule. Această măsurare nu setează un identificator propriu de vizitator și nu este folosită pentru publicitate comportamentală.</p>

      <h2>Analiză statistică opțională</h2>
      <p>Dacă alegi „Analiză”, activăm Google Analytics 4 pentru statistici mai detaliate despre utilizarea site-ului. Dacă nu accepți, Google Analytics nu este încărcat.</p>

      <h2>Marketing</h2>
      <p>În acest moment nu utilizăm instrumente de publicitate sau profilare pentru vizitatorii site-ului.</p>

      <h2>Modificarea preferințelor</h2>
      <p>Poți redeschide oricând fereastra „Setări cookies” din partea de jos a site-ului.</p>
    </LegalLayout>
  )
}

function TermsPage() {
  return (
    <LegalLayout eyebrow="INFORMAȚII LEGALE" title="Termeni și condiții">
      <h2>Despre site</h2>
      <p>Site-ul CAT Courier Auto prezintă autoturisme și autoutilitare oferite spre vânzare de {COMPANY.legalName}.</p>

      <h2>Prețuri</h2>
      <p>Prețul introdus în panoul de administrare reprezintă prețul fără TVA. Pe site acesta este afișat în forma „preț + TVA {VAT_RATE}%”.</p>

      <h2>Disponibilitatea</h2>
      <p>Statusul unui vehicul poate fi „În stoc”, „Rezervat” sau „Vândut”. Disponibilitatea se confirmă înainte de deplasarea la parc.</p>

      <h2>Caracteristicile vehiculelor</h2>
      <p>Depunem eforturi pentru ca informațiile, kilometrajul, specificațiile și fotografiile să fie corecte și actuale. Informațiile marcate ca fiind în curs de actualizare trebuie confirmate înainte de încheierea tranzacției.</p>

      <h2>Imagini orientative</h2>
      <p>Pentru vehiculele pentru care fotografiile reale nu au fost încă publicate, site-ul poate afișa o imagine generică marcată explicit ca imagine orientativă. Aceasta nu reprezintă fotografierea vehiculului oferit efectiv spre vânzare.</p>

      <h2>Garanție comercială</h2>
      <p>CAT Courier SRL nu oferă o garanție comercială suplimentară pentru vehiculele rulate, dacă nu este menționat expres altfel într-un anumit anunț sau document.</p>
      <p>Această mențiune nu înlătură și nu limitează drepturile legale privind conformitatea bunurilor care se aplică cumpărătorilor ce au calitatea de consumator, conform legislației în vigoare.</p>

      <h2>Vânzări către profesioniști</h2>
      <p>În cazul tranzacțiilor încheiate cu persoane juridice sau alți cumpărători care acționează în scop profesional, condițiile sunt stabilite în documentele contractuale.</p>
    </LegalLayout>
  )
}

function CompanyPage() {
  return (
    <LegalLayout eyebrow="CAT COURIER" title="Date companie">
      <div className="companyLegalCard">
        <img src="/cat-courier-orizontal-2000.png" alt="CAT Courier" />
        <h2>{COMPANY.legalName}</h2>
        <p>CUI: <strong>{COMPANY.cui}</strong></p>
        <p>Nr. Registrul Comerțului: <strong>{COMPANY.registry}</strong></p>
        <p>{ADDRESS}</p>
        <p>Telefon principal: <a href={`tel:${PHONE_PRIMARY}`}>{PHONE_PRIMARY_DISPLAY}</a></p>
        <p>Telefon secundar: <a href={`tel:${PHONE_SECONDARY}`}>{PHONE_SECONDARY_DISPLAY}</a></p>
        {COMPANY.email && <p>E-mail: <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a></p>}

        <div className="legalExternalLinks">
          <a href={ANPC_URL} target="_blank" rel="noreferrer">ANPC</a>
          <a href={SAL_URL} target="_blank" rel="noreferrer">Soluționare alternativă a litigiilor</a>
        </div>
      </div>
    </LegalLayout>
  )
}

function CookieConsent({ preferences, settingsOpen, setSettingsOpen, savePreferences }) {
  const [analytics, setAnalytics] = useState(preferences?.analytics || false)
  const [marketing, setMarketing] = useState(preferences?.marketing || false)

  useEffect(() => {
    setAnalytics(preferences?.analytics || false)
    setMarketing(preferences?.marketing || false)
  }, [preferences, settingsOpen])

  if (preferences && !settingsOpen) return null

  if (settingsOpen) {
    return (
      <div className="cookieBackdrop">
        <div className="cookiePreferences" role="dialog" aria-modal="true">
          <div className="cookieModalHeader">
            <div><span className="sectionLabel">CONFIDENȚIALITATE</span><h2>Preferințe cookies</h2></div>
            <button onClick={() => setSettingsOpen(false)}>×</button>
          </div>

          <div className="cookieOption">
            <div><strong>Necesare</strong><span>Funcționarea site-ului, favoritele și memorarea preferințelor.</span></div>
            <span className="alwaysOn">Mereu active</span>
          </div>

          <label className="cookieOption">
            <div><strong>Analiză</strong><span>Activează Google Analytics 4 pentru statistici detaliate despre utilizarea site-ului.</span></div>
            <input type="checkbox" checked={analytics} onChange={(e) => setAnalytics(e.target.checked)} />
          </label>

          <label className="cookieOption">
            <div><strong>Marketing</strong><span>Nu folosim momentan instrumente de marketing sau publicitate comportamentală.</span></div>
            <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
          </label>

          <div className="cookieModalActions">
            <button className="cookieSecondary" onClick={() => savePreferences({ necessary: true, analytics: false, marketing: false })}>Doar necesare</button>
            <button className="cookiePrimary" onClick={() => savePreferences({ necessary: true, analytics, marketing })}>Salvează preferințele</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="cookieBanner" role="dialog">
      <div className="cookieBannerText">
        <img src="/cat-courier-simbol-512.png" alt="" />
        <div>
          <strong>Respectăm confidențialitatea ta</strong>
          <p>Folosim tehnologii necesare pentru funcționarea site-ului. Google Analytics este activat numai dacă alegi „Analiză”.</p>
          <button onClick={() => go('/legal/cookies')}>Politica de cookies</button>
        </div>
      </div>

      <div className="cookieBannerActions">
        <button className="cookieSettingsButton" onClick={() => setSettingsOpen(true)}>Preferințe</button>
        <button className="cookieNecessaryButton" onClick={() => savePreferences({ necessary: true, analytics: false, marketing: false })}>Doar necesare</button>
        <button className="cookieAcceptButton" onClick={() => savePreferences({ necessary: true, analytics: true, marketing: true })}>Acceptă toate</button>
      </div>
    </div>
  )
}

function AdminPage({ session, authLoading, adminChecking, isAdmin, vehicles, refreshVehicles }) {
  if (authLoading || adminChecking) return <div className="adminLoading">Se verifică accesul...</div>
  if (!session) return <AdminLogin />

  if (!isAdmin) {
    return (
      <section className="adminDenied">
        <span className="sectionLabel">ADMIN</span>
        <h1>Acces neautorizat</h1>
        <button onClick={async () => { await supabase.auth.signOut() }}>Ieșire</button>
      </section>
    )
  }

  return <AdminDashboard session={session} vehicles={vehicles} refreshVehicles={refreshVehicles} />
}

function AdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const login = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (signInError) setError('Email sau parolă incorectă.')
    setLoading(false)
  }

  return (
    <section className="adminLoginPage">
      <div className="adminLoginCard">
        <img src="/cat-courier-orizontal-2000.png" alt="CAT Courier" className="adminLoginLogo" />
        <span className="sectionLabel">CAT COURIER AUTO</span>
        <h1>Administrare</h1>

        <form onSubmit={login} className="adminLoginForm">
          <label><span>Email</span><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label><span>Parolă</span><input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          {error && <div className="formError">{error}</div>}
          <button type="submit" disabled={loading}>{loading ? 'Se conectează...' : 'Intră în Admin'}</button>
        </form>
      </div>
    </section>
  )
}

function sumEvent(rows, eventName) {
  return rows
    .filter((row) => row.event_name === eventName)
    .reduce((sum, row) => sum + Number(row.event_count || 0), 0)
}

function AnalyticsDashboard({ vehicles }) {
  const [days, setDays] = useState(7)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadAnalytics = useCallback(async () => {
    setLoading(true)
    setError('')

    const { data, error: rpcError } = await supabase.rpc('get_site_analytics', {
      p_days: days,
    })

    if (rpcError) {
      console.error(rpcError)
      setError(rpcError.message || 'Nu am putut încărca statisticile.')
      setRows([])
    } else {
      setRows(data || [])
    }

    setLoading(false)
  }, [days])

  useEffect(() => {
    loadAnalytics()
  }, [loadAnalytics])

  const summary = useMemo(() => {
    const siteViews = sumEvent(rows, 'site_view')
    const vehicleViews = sumEvent(rows, 'vehicle_view')
    const phone = sumEvent(rows, 'phone_click')
    const whatsapp = sumEvent(rows, 'whatsapp_click')
    const favorites = sumEvent(rows, 'favorite_add')
    const gallery = sumEvent(rows, 'gallery_next') + sumEvent(rows, 'gallery_prev')

    const byVehicle = new Map()

    rows.forEach((row) => {
      if (!row.vehicle_id) return

      if (!byVehicle.has(row.vehicle_id)) {
        const vehicle = vehicles.find((item) => item.id === row.vehicle_id)
        byVehicle.set(row.vehicle_id, {
          id: row.vehicle_id,
          slug: row.vehicle_slug || vehicle?.slug || '',
          name: vehicle ? `${vehicle.brand || ''} ${vehicle.model || ''}`.trim() : row.vehicle_slug || 'Vehicul',
          vin: vehicle?.vin || '',
          views: 0,
          phone: 0,
          whatsapp: 0,
          favorites: 0,
          gallery: 0,
        })
      }

      const item = byVehicle.get(row.vehicle_id)
      const count = Number(row.event_count || 0)

      if (row.event_name === 'vehicle_view') item.views += count
      if (row.event_name === 'phone_click') item.phone += count
      if (row.event_name === 'whatsapp_click') item.whatsapp += count
      if (row.event_name === 'favorite_add') item.favorites += count
      if (row.event_name === 'gallery_next' || row.event_name === 'gallery_prev') item.gallery += count
    })

    const vehiclesRanked = [...byVehicle.values()]
      .map((item) => ({
        ...item,
        score: Math.round(
          item.views * 1 +
          item.gallery * 0.25 +
          item.favorites * 4 +
          item.whatsapp * 8 +
          item.phone * 10,
        ),
      }))
      .sort((a, b) => b.score - a.score)

    const sourceMap = new Map()
    const deviceMap = new Map()
    const hourMap = new Map()

    rows
      .filter((row) => row.event_name === 'site_view')
      .forEach((row) => {
        const count = Number(row.event_count || 0)
        const source = row.source || 'direct'
        const device = row.device_type || 'unknown'

        sourceMap.set(source, (sourceMap.get(source) || 0) + count)
        deviceMap.set(device, (deviceMap.get(device) || 0) + count)

        const hour = new Date(row.bucket).getHours()
        hourMap.set(hour, (hourMap.get(hour) || 0) + count)
      })

    const sources = [...sourceMap.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)

    const devices = [...deviceMap.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)

    const hours = [...hourMap.entries()]
      .map(([hour, count]) => ({ hour, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    return {
      siteViews,
      vehicleViews,
      phone,
      whatsapp,
      favorites,
      gallery,
      vehiclesRanked,
      sources,
      devices,
      hours,
    }
  }, [rows, vehicles])

  const maxSource = Math.max(1, ...summary.sources.map((item) => item.count))
  const maxDevice = Math.max(1, ...summary.devices.map((item) => item.count))

  return (
    <section className="analyticsPanel">
      <div className="analyticsTop">
        <div>
          <span className="sectionLabel">ANALYTICS INTERN</span>
          <h2>Interesul pentru stoc</h2>
          <div className="analyticsMuted">Supabase = trafic agregat. GA4 rămâne separat pentru vizitatorii care acceptă Analiză.</div>
        </div>

        <div className="analyticsRange">
          {[1, 7, 30].map((value) => (
            <button key={value} className={days === value ? 'active' : ''} onClick={() => setDays(value)}>
              {value === 1 ? '24h' : `${value} zile`}
            </button>
          ))}
          <button className="analyticsRefresh" onClick={loadAnalytics}>↻ Actualizează</button>
        </div>
      </div>

      {error && <div className="analyticsError">{error}</div>}

      <div className="analyticsKpis">
        <AnalyticsKpi label="Pagini" value={summary.siteViews} />
        <AnalyticsKpi label="Anunțuri deschise" value={summary.vehicleViews} />
        <AnalyticsKpi label="Telefon" value={summary.phone} />
        <AnalyticsKpi label="WhatsApp" value={summary.whatsapp} />
        <AnalyticsKpi label="Favorite" value={summary.favorites} />
        <AnalyticsKpi label="Interacțiuni poze" value={summary.gallery} />
      </div>

      {loading ? (
        <div className="analyticsMuted">Se încarcă statisticile...</div>
      ) : (
        <div className="analyticsGrid">
          <div className="analyticsCard">
            <h3>Top vehicule după interes</h3>
            <div className="analyticsTableWrap">
              <table className="analyticsTable">
                <thead>
                  <tr>
                    <th>Vehicul</th>
                    <th>Vizualizări</th>
                    <th>WhatsApp</th>
                    <th>Telefon</th>
                    <th>Favorite</th>
                    <th>Poze</th>
                    <th>Scor</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.vehiclesRanked.length === 0 ? (
                    <tr><td colSpan="7">Nu există încă date pentru acest interval.</td></tr>
                  ) : (
                    summary.vehiclesRanked.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <div className="analyticsVehicleName">
                            <strong>{item.name}</strong>
                            <small>{item.vin || item.slug}</small>
                          </div>
                        </td>
                        <td>{item.views}</td>
                        <td>{item.whatsapp}</td>
                        <td>{item.phone}</td>
                        <td>{item.favorites}</td>
                        <td>{item.gallery}</td>
                        <td><span className="interestBadge">{item.score}</span></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <p className="analyticsMuted">Scorul este un indicator intern de interes, nu o probabilitate de vânzare. Îl putem calibra ulterior cu vânzările reale.</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div className="analyticsCard">
              <h3>Surse trafic</h3>
              <AnalyticsBars items={summary.sources} max={maxSource} empty="Nu există încă surse înregistrate." />
            </div>

            <div className="analyticsCard">
              <h3>Dispozitive</h3>
              <AnalyticsBars items={summary.devices} max={maxDevice} empty="Nu există încă date." />
            </div>

            <div className="analyticsCard">
              <h3>Ore active</h3>
              {summary.hours.length === 0 ? (
                <div className="analyticsMuted">Nu există încă date.</div>
              ) : (
                <div className="analyticsList">
                  {summary.hours.map((item) => (
                    <div className="analyticsListRow" key={item.hour}>
                      <div><strong>{String(item.hour).padStart(2, '0')}:00 - {String((item.hour + 1) % 24).padStart(2, '0')}:00</strong></div>
                      <strong>{item.count}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function AnalyticsKpi({ label, value }) {
  return <div className="analyticsKpi"><span>{label}</span><strong>{formatNumber(value)}</strong></div>
}

function AnalyticsBars({ items, max, empty }) {
  if (items.length === 0) return <div className="analyticsMuted">{empty}</div>

  return (
    <div className="analyticsList">
      {items.slice(0, 8).map((item) => (
        <div className="analyticsListRow" key={item.name}>
          <div>
            <strong>{item.name}</strong>
            <div className="analyticsBarTrack">
              <div className="analyticsBarFill" style={{ width: `${Math.max(3, (item.count / max) * 100)}%` }} />
            </div>
          </div>
          <strong>{item.count}</strong>
        </div>
      ))}
    </div>
  )
}

function AdminDashboard({ session, vehicles, refreshVehicles }) {
  const [editingVehicle, setEditingVehicle] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const publishedCount = vehicles.filter((vehicle) => vehicle.is_published).length
  const stockCount = vehicles.filter((vehicle) => vehicle.status === 'În stoc').length
  const carCount = vehicles.filter((vehicle) => vehicle.vehicle_type === 'Autoturism').length
  const vanCount = vehicles.filter((vehicle) => vehicle.vehicle_type === 'Autoutilitară').length

  const togglePublished = async (vehicle) => {
    setMessage('')
    setError('')

    const { error: updateError } = await supabase
      .from('vehicles')
      .update({ is_published: !vehicle.is_published })
      .eq('id', vehicle.id)

    if (updateError) {
      setError(updateError.message)
      return
    }

    await refreshVehicles()
  }

  const deleteVehicle = async (vehicle) => {
    if (!window.confirm(`Ștergi definitiv ${vehicle.brand} ${vehicle.model}?`)) return

    const paths = (vehicle.images || []).map(storagePathFromUrl).filter(Boolean)
    if (paths.length > 0) await supabase.storage.from('vehicle-images').remove(paths)

    const { error: deleteError } = await supabase.from('vehicles').delete().eq('id', vehicle.id)

    if (deleteError) {
      setError(deleteError.message)
      return
    }

    setMessage('Vehiculul a fost șters.')
    await refreshVehicles()
  }

  return (
    <section className="adminPage">
      <div className="adminTop">
        <div><span className="sectionLabel">CAT COURIER AUTO</span><h1>Administrare stoc</h1><p>{session.user.email}</p></div>
        <div className="adminTopActions">
          <button onClick={() => go('/')} className="adminSiteButton">Vezi site-ul</button>
          <button onClick={async () => { await supabase.auth.signOut() }} className="adminLogoutButton">Ieșire</button>
        </div>
      </div>

      <div className="adminStats adminStatsWide">
        <div><span>Total</span><strong>{vehicles.length}</strong></div>
        <div><span>Publicate</span><strong>{publishedCount}</strong></div>
        <div><span>În stoc</span><strong>{stockCount}</strong></div>
        <div><span>Autoturisme</span><strong>{carCount}</strong></div>
        <div><span>Autoutilitare</span><strong>{vanCount}</strong></div>
      </div>

      <AnalyticsDashboard vehicles={vehicles} />

      {message && <div className="adminSuccess">{message}</div>}
      {error && <div className="adminError">{error}</div>}

      {showForm ? (
        <AdminVehicleForm
          vehicle={editingVehicle}
          onCancel={() => { setShowForm(false); setEditingVehicle(null) }}
          onSaved={async () => {
            await refreshVehicles()
            setShowForm(false)
            setEditingVehicle(null)
          }}
        />
      ) : (
        <>
          <div className="adminSectionHeader">
            <div><span className="sectionLabel">STOC</span><h2>Vehicule</h2></div>
            <button onClick={() => { setEditingVehicle(null); setShowForm(true) }} className="addVehicleButton">+ Adaugă vehicul</button>
          </div>

          <div className="adminVehicleList">
            {vehicles.map((vehicle) => (
              <article className="adminVehicle" key={vehicle.id}>
                <div className="adminVehicleImage">
                  {vehicle.images?.length > 0 ? <img src={vehicle.images[0]} alt="" /> : <span>CAT AUTO</span>}
                </div>

                <div className="adminVehicleInfo">
                  <div className="adminVehicleBadges">
                    <span className="vehicleTypeMiniBadge">{vehicleTypeLabel(vehicle)}</span>
                    <span className={`miniStatus ${statusClass(vehicle.status)}`}>{vehicle.status}</span>
                    <span className={vehicle.is_published ? 'publishedBadge' : 'draftBadge'}>{vehicle.is_published ? 'PUBLICAT' : 'NEPUBLICAT'}</span>
                  </div>

                  <strong>{vehicle.brand} {vehicle.model}</strong>
                  <span>{formatYear(vehicle)} · {formatKm(vehicle)} · {formatPrice(vehicle)}</span>
                  {vehicle.vin && <span>VIN: {vehicle.vin}</span>}
                </div>

                <div className="adminVehicleActions">
                  <button onClick={() => togglePublished(vehicle)}>{vehicle.is_published ? 'Retrage' : 'Publică'}</button>
                  <button onClick={() => { setEditingVehicle(vehicle); setShowForm(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Editează</button>
                  <button className="deleteButton" onClick={() => deleteVehicle(vehicle)}>Șterge</button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

function AdminVehicleForm({ vehicle, onCancel, onSaved }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [existingImages, setExistingImages] = useState([])
  const [imagesToDelete, setImagesToDelete] = useState([])
  const [files, setFiles] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (vehicle) {
      setForm({
        vehicle_type: vehicle.vehicle_type || 'Autoutilitară',
        vin: vehicle.vin || '',
        first_registration_date: vehicle.first_registration_date || '',
        brand: vehicle.brand || '',
        model: vehicle.model || '',
        year: vehicle.year || '',
        month: vehicle.month || '',
        km: vehicle.km ?? '',
        price: vehicle.price ?? '',
        currency: vehicle.currency || 'EUR',
        fuel: vehicle.fuel || '',
        gearbox: vehicle.gearbox || '',
        power: vehicle.power || '',
        engine: vehicle.engine || '',
        traction: vehicle.traction || '',
        status: vehicle.status || 'În stoc',
        description: vehicle.description || '',
        featuresText: (vehicle.features || []).join('\n'),
        is_published: Boolean(vehicle.is_published),
        sort_order: vehicle.sort_order ?? 0,
      })
      setExistingImages(vehicle.images || [])
    } else {
      setForm({ ...EMPTY_FORM })
      setExistingImages([])
    }

    setImagesToDelete([])
    setFiles([])
    setError('')
  }, [vehicle])

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const removeImage = (index) => {
    const url = existingImages[index]
    setExistingImages((current) => current.filter((_, imageIndex) => imageIndex !== index))
    if (url) setImagesToDelete((current) => [...current, url])
  }

  const moveImage = (index, direction) => {
    const target = index + direction
    if (target < 0 || target >= existingImages.length) return

    const next = [...existingImages]
    ;[next[index], next[target]] = [next[target], next[index]]
    setExistingImages(next)
  }

  const save = async (event) => {
    event.preventDefault()
    setError('')

    if (!form.brand.trim() || !form.model.trim()) {
      setError('Completează marca și modelul.')
      return
    }

    setSaving(true)

    try {
      const features = form.featuresText.split('\n').map((item) => item.trim()).filter(Boolean)

      const payload = {
        vehicle_type: form.vehicle_type,
        vin: form.vin.trim() ? form.vin.trim().toUpperCase() : null,
        first_registration_date: form.first_registration_date || null,
        brand: form.brand.trim(),
        model: form.model.trim(),
        year: form.year ? Number(form.year) : null,
        month: form.month ? Number(form.month) : null,
        km: form.km === '' ? null : Number(form.km),
        price: form.price === '' ? null : Number(form.price),
        currency: form.currency,
        fuel: form.fuel.trim() || null,
        gearbox: form.gearbox.trim() || null,
        power: form.power.trim() || null,
        engine: form.engine.trim() || null,
        traction: form.traction.trim() || null,
        status: form.status,
        description: form.description.trim() || null,
        features,
        is_published: form.is_published,
        sort_order: Number(form.sort_order || 0),
      }

      let savedVehicle = vehicle

      if (vehicle) {
        const { data, error: updateError } = await supabase
          .from('vehicles')
          .update(payload)
          .eq('id', vehicle.id)
          .select()
          .single()

        if (updateError) throw updateError
        savedVehicle = data
      } else {
        const unique = Date.now().toString(36)
        const slug = `${slugify(`${form.brand}-${form.model}-${form.year || 'auto'}`)}-${unique}`

        const { data, error: insertError } = await supabase
          .from('vehicles')
          .insert({ ...payload, slug, images: [] })
          .select()
          .single()

        if (insertError) throw insertError
        savedVehicle = data
      }

      const uploadedUrls = []

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index]
        const filename = safeFilename(file.name || `foto-${index}.jpg`)
        const path = `${savedVehicle.id}/${Date.now()}-${index}-${filename}`

        const { error: uploadError } = await supabase.storage
          .from('vehicle-images')
          .upload(path, file, {
            upsert: false,
            contentType: file.type || undefined,
          })

        if (uploadError) throw uploadError

        const { data: publicUrlData } = supabase.storage.from('vehicle-images').getPublicUrl(path)
        uploadedUrls.push(publicUrlData.publicUrl)
      }

      const finalImages = [...existingImages, ...uploadedUrls]

      const { error: imageUpdateError } = await supabase
        .from('vehicles')
        .update({ images: finalImages })
        .eq('id', savedVehicle.id)

      if (imageUpdateError) throw imageUpdateError

      const pathsToDelete = imagesToDelete.map(storagePathFromUrl).filter(Boolean)
      if (pathsToDelete.length > 0) await supabase.storage.from('vehicle-images').remove(pathsToDelete)

      await onSaved()
    } catch (saveError) {
      console.error(saveError)
      setError(saveError.message || 'Nu am putut salva vehiculul.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="adminVehicleForm" onSubmit={save}>
      <div className="adminFormHeader">
        <div><span className="sectionLabel">{vehicle ? 'EDITARE' : 'ANUNȚ NOU'}</span><h2>{vehicle ? `${vehicle.brand} ${vehicle.model}` : 'Adaugă vehicul'}</h2></div>
        <button type="button" onClick={onCancel} className="cancelAdminButton">Închide ×</button>
      </div>

      {error && <div className="adminError">{error}</div>}

      <div className="formSection">
        <h3>Identificare</h3>
        <div className="adminFormGrid">
          <label className="adminField">
            <span>Tip vehicul *</span>
            <select value={form.vehicle_type} onChange={(e) => updateField('vehicle_type', e.target.value)}>
              <option value="Autoutilitară">Autoutilitară</option>
              <option value="Autoturism">Autoturism</option>
            </select>
          </label>
          <AdminField label="VIN" value={form.vin} onChange={(value) => updateField('vin', value.toUpperCase())} placeholder="WV1..." />
          <AdminField label="Marcă *" value={form.brand} onChange={(value) => updateField('brand', value)} />
          <AdminField label="Model *" value={form.model} onChange={(value) => updateField('model', value)} />
        </div>
      </div>

      <div className="formSection">
        <h3>Date vehicul</h3>
        <div className="adminFormGrid">
          <AdminField label="An model" type="number" value={form.year} onChange={(value) => updateField('year', value)} />

          <label className="adminField">
            <span>Lună model</span>
            <select value={form.month} onChange={(e) => updateField('month', e.target.value)}>
              <option value="">-</option>
              {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                <option key={month} value={month}>{String(month).padStart(2, '0')}</option>
              ))}
            </select>
          </label>

          <AdminField label="Prima înmatriculare" type="date" value={form.first_registration_date} onChange={(value) => updateField('first_registration_date', value)} />
          <AdminField label="Kilometri" type="number" value={form.km} onChange={(value) => updateField('km', value)} />
          <AdminField label="Preț fără TVA" type="number" value={form.price} onChange={(value) => updateField('price', value)} />

          <label className="adminField">
            <span>Monedă</span>
            <select value={form.currency} onChange={(e) => updateField('currency', e.target.value)}>
              <option value="EUR">EUR</option>
              <option value="RON">RON</option>
            </select>
          </label>

          <label className="adminField">
            <span>Status</span>
            <select value={form.status} onChange={(e) => updateField('status', e.target.value)}>
              <option>În stoc</option><option>Rezervat</option><option>Vândut</option>
            </select>
          </label>

          <AdminField label="Ordine administrare" type="number" value={form.sort_order} onChange={(value) => updateField('sort_order', value)} />
        </div>
      </div>

      <div className="formSection">
        <h3>Date tehnice</h3>
        <div className="adminFormGrid">
          <AdminField label="Motor" value={form.engine} onChange={(value) => updateField('engine', value)} placeholder="2.0 TDI" />
          <AdminField label="Putere" value={form.power} onChange={(value) => updateField('power', value)} placeholder="150 CP" />
          <AdminField label="Combustibil" value={form.fuel} onChange={(value) => updateField('fuel', value)} />
          <AdminField label="Cutie" value={form.gearbox} onChange={(value) => updateField('gearbox', value)} />
          <AdminField label="Tracțiune" value={form.traction} onChange={(value) => updateField('traction', value)} />
        </div>
      </div>

      <div className="formSection">
        <h3>Descriere și dotări</h3>
        <label className="adminField full"><span>Descriere</span><textarea rows="6" value={form.description} onChange={(e) => updateField('description', e.target.value)} /></label>
        <label className="adminField full"><span>Dotări — una pe fiecare rând</span><textarea rows="7" value={form.featuresText} onChange={(e) => updateField('featuresText', e.target.value)} /></label>
      </div>

      <div className="formSection">
        <h3>Fotografii</h3>

        {existingImages.length > 0 && (
          <div className="adminImages">
            {existingImages.map((image, index) => (
              <div className="adminImage" key={`${image}-${index}`}>
                <img src={image} alt="" />
                <div className="adminImageControls">
                  <button type="button" onClick={() => moveImage(index, -1)}>←</button>
                  <button type="button" onClick={() => moveImage(index, 1)}>→</button>
                  <button type="button" className="removeImageButton" onClick={() => removeImage(index)}>×</button>
                </div>
                {index === 0 && <span className="mainPhotoBadge">PRINCIPALĂ</span>}
              </div>
            ))}
          </div>
        )}

        <label className="uploadBox">
          <strong>+ Adaugă fotografii reale</strong>
          <span>Dacă nu există fotografii, site-ul afișează automat imaginea orientativă.</span>
          <input type="file" accept="image/*" multiple onChange={(e) => setFiles(Array.from(e.target.files || []))} />
        </label>

        {files.length > 0 && <div className="selectedFiles"><strong>{files.length} fotografii selectate</strong></div>}
      </div>

      <div className="formSection publishSection">
        <label className="publishSwitch">
          <input type="checkbox" checked={form.is_published} onChange={(e) => updateField('is_published', e.target.checked)} />
          <div><strong>Publică pe site</strong><span>Dacă este dezactivat, anunțul rămâne doar în Admin.</span></div>
        </label>
      </div>

      <div className="adminFormActions">
        <button type="button" onClick={onCancel} className="secondaryAdminButton">Renunță</button>
        <button type="submit" disabled={saving} className="saveAdminButton">{saving ? 'Se salvează...' : 'Salvează'}</button>
      </div>
    </form>
  )
}

function AdminField({ label, value, onChange, type = 'text', placeholder = '' }) {
  return (
    <label className="adminField">
      <span>{label}</span>
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

function Footer({ onCookieSettings, activeVehicle }) {
  const analytics = vehicleAnalyticsData(activeVehicle, 'footer')

  return (
    <footer className="footer">
      <div className="footerBrand">
        <img src="/cat-courier-orizontal-2000.png" alt="CAT Courier" />
        <strong>CAT Courier Auto</strong>
        <span>Autoturisme & Autoutilitare</span>
      </div>

      <div className="footerCompany">
        <strong>{COMPANY.legalName}</strong>
        <span>CUI: {COMPANY.cui}</span>
        <span>Reg. Com.: {COMPANY.registry}</span>
        <span>{ADDRESS}</span>
        <a href={`tel:${PHONE_PRIMARY}`} onClick={() => trackInteraction('phone_click', analytics)}>{PHONE_PRIMARY_DISPLAY}</a>
        <a href={`tel:${PHONE_SECONDARY}`} onClick={() => trackInteraction('phone_click', { ...analytics, location: 'footer_secondary' })}>{PHONE_SECONDARY_DISPLAY}</a>
        {COMPANY.email && <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>}
      </div>

      <div className="footerLinks">
        <button onClick={() => go('/legal/confidentialitate')}>Confidențialitate</button>
        <button onClick={() => go('/legal/cookies')}>Cookies</button>
        <button onClick={onCookieSettings}>Setări cookies</button>
        <button onClick={() => go('/legal/termeni')}>Termeni și condiții</button>
        <button onClick={() => go('/legal/date-companie')}>Date companie</button>
        <a href={ANPC_URL} target="_blank" rel="noreferrer">ANPC</a>
        <a href={SAL_URL} target="_blank" rel="noreferrer">SAL</a>
      </div>

      <div className="footerBottom">
        <span>© 2026 CAT Courier SRL</span>
        <button onClick={() => go('/admin')}>Admin</button>
      </div>
    </footer>
  )
}

export default App
