const GA_MEASUREMENT_ID =
  'G-H2R49DF5NS'

const SUPABASE_URL =
  import.meta.env
    .VITE_SUPABASE_URL

const SUPABASE_KEY =
  import.meta.env
    .VITE_SUPABASE_PUBLISHABLE_KEY

let googleAnalyticsAllowed =
  false

let googleAnalyticsLoaded =
  false

let attributionCache = null

const recentEvents =
  new Map()

/* ==========================================
   UTILITARE
========================================== */

function normalizeValue(
  value,
  fallback = '',
  maxLength = 120,
) {
  const clean = String(
    value ?? fallback,
  )
    .trim()
    .slice(
      0,
      maxLength,
    )

  return clean || fallback
}

function currentPageKey() {
  const hash =
    window.location.hash ||
    '#/'

  if (
    hash.startsWith(
      '#/duba/',
    )
  ) {
    return 'vehicle'
  }

  if (
    hash === '#/favorite'
  ) {
    return 'favorites'
  }

  if (
    hash === '#/admin'
  ) {
    return 'admin'
  }

  if (
    hash.startsWith(
      '#/legal/',
    )
  ) {
    return 'legal'
  }

  return 'home'
}

/* ==========================================
   TIP DISPOZITIV
========================================== */

export function getDeviceType() {
  const ua =
    navigator.userAgent
      .toLowerCase()

  const isIPad =
    /ipad/.test(ua) ||
    (
      /macintosh/.test(
        ua,
      ) &&
      navigator.maxTouchPoints >
        1
    )

  if (isIPad) {
    return 'tablet'
  }

  if (
    /tablet/.test(ua)
  ) {
    return 'tablet'
  }

  if (
    /iphone|ipod|mobile/.test(
      ua,
    )
  ) {
    return 'mobile'
  }

  if (
    /android/.test(ua)
  ) {
    if (
      /mobile/.test(ua)
    ) {
      return 'mobile'
    }

    return 'tablet'
  }

  if (
    window.innerWidth <
    700
  ) {
    return 'mobile'
  }

  if (
    window.innerWidth <
    1100
  ) {
    return 'tablet'
  }

  return 'desktop'
}

/* ==========================================
   SURSA TRAFICULUI
========================================== */

function sourceFromReferrer() {
  if (
    !document.referrer
  ) {
    return {
      source: 'direct',
      medium: 'none',
    }
  }

  try {
    const referrer =
      new URL(
        document.referrer,
      )

    const host =
      referrer.hostname
        .toLowerCase()

    if (
      host ===
        window.location
          .hostname ||
      host.endsWith(
        `.${window.location.hostname}`,
      )
    ) {
      return {
        source: 'internal',
        medium: 'internal',
      }
    }

    if (
      host.includes(
        'google.',
      )
    ) {
      return {
        source: 'google',
        medium: 'organic',
      }
    }

    if (
      host.includes(
        'bing.',
      )
    ) {
      return {
        source: 'bing',
        medium: 'organic',
      }
    }

    if (
      host.includes(
        'yahoo.',
      )
    ) {
      return {
        source: 'yahoo',
        medium: 'organic',
      }
    }

    if (
      host.includes(
        'facebook.',
      ) ||
      host.includes(
        'fb.',
      )
    ) {
      return {
        source: 'facebook',
        medium: 'social',
      }
    }

    if (
      host.includes(
        'instagram.',
      )
    ) {
      return {
        source: 'instagram',
        medium: 'social',
      }
    }

    if (
      host.includes(
        'tiktok.',
      )
    ) {
      return {
        source: 'tiktok',
        medium: 'social',
      }
    }

    if (
      host === 't.co' ||
      host.includes(
        'twitter.',
      ) ||
      host.includes(
        'x.com',
      )
    ) {
      return {
        source: 'x',
        medium: 'social',
      }
    }

    return {
      source: host,
      medium: 'referral',
    }
  } catch {
    return {
      source: 'direct',
      medium: 'none',
    }
  }
}

export function getTrafficAttribution() {
  if (
    attributionCache
  ) {
    return attributionCache
  }

  const params =
    new URLSearchParams(
      window.location.search,
    )

  const utmSource =
    params.get(
      'utm_source',
    )

  const utmMedium =
    params.get(
      'utm_medium',
    )

  const utmCampaign =
    params.get(
      'utm_campaign',
    )

  if (utmSource) {
    attributionCache = {
      source:
        normalizeValue(
          utmSource,
          'direct',
          100,
        ).toLowerCase(),

      medium:
        normalizeValue(
          utmMedium,
          'none',
          60,
        ).toLowerCase(),

      campaign:
        normalizeValue(
          utmCampaign,
          '',
          120,
        ),
    }

    return attributionCache
  }

  const referral =
    sourceFromReferrer()

  attributionCache = {
    source:
      referral.source,

    medium:
      referral.medium,

    campaign: '',
  }

  return attributionCache
}

/* ==========================================
   CONTOR PROPRIU SUPABASE
========================================== */

function shouldDedupe(
  eventName,
  eventKey,
) {
  /*
   * Doar pentru page views.
   * Ne protejează și de dublarea
   * efectelor React în development.
   */

  if (
    eventName !==
      'site_view' &&
    eventName !==
      'vehicle_view'
  ) {
    return false
  }

  const key =
    `${eventName}:${eventKey}`

  const now =
    Date.now()

  const previous =
    recentEvents.get(
      key,
    )

  if (
    previous &&
    now - previous <
      1500
  ) {
    return true
  }

  recentEvents.set(
    key,
    now,
  )

  return false
}

export async function trackSiteEvent(
  eventName,
  options = {},
) {
  if (
    !SUPABASE_URL ||
    !SUPABASE_KEY
  ) {
    console.warn(
      'Analytics Supabase: lipsesc variabilele de mediu.',
    )

    return
  }

  const attribution =
    getTrafficAttribution()

  const pageKey =
    normalizeValue(
      options.pageKey ||
        currentPageKey(),
      'site',
      100,
    ).toLowerCase()

  const vehicleSlug =
    normalizeValue(
      options.vehicleSlug,
      '',
      160,
    )

  const eventKey =
    options.vehicleId ||
    vehicleSlug ||
    pageKey

  if (
    shouldDedupe(
      eventName,
      eventKey,
    )
  ) {
    return
  }

  const payload = {
    p_event_name:
      eventName,

    p_page_key:
      pageKey,

    p_vehicle_id:
      options.vehicleId ||
      null,

    p_vehicle_slug:
      vehicleSlug ||
      null,

    p_source:
      attribution.source,

    p_medium:
      attribution.medium,

    p_campaign:
      attribution.campaign,

    p_device_type:
      getDeviceType(),
  }

  try {
    await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/track_site_event`,
      {
        method: 'POST',

        headers: {
          apikey:
            SUPABASE_KEY,

          Authorization:
            `Bearer ${SUPABASE_KEY}`,

          'Content-Type':
            'application/json',
        },

        body:
          JSON.stringify(
            payload,
          ),

        /*
         * Ajută la clickurile Telefon /
         * WhatsApp când utilizatorul
         * părăsește pagina imediat.
         */
        keepalive: true,

        cache: 'no-store',

        credentials:
          'omit',
      },
    )
  } catch (error) {
    /*
     * Nu stricăm niciodată site-ul
     * dacă analytics nu răspunde.
     */
    console.warn(
      'Analytics event nereușit:',
      eventName,
      error,
    )
  }
}

/* ==========================================
   GOOGLE ANALYTICS 4
   DOAR DUPĂ CONSIMȚĂMÂNT
========================================== */

function createGtag() {
  window.dataLayer =
    window.dataLayer || []

  window.gtag =
    window.gtag ||
    function gtag() {
      window.dataLayer.push(
        arguments,
      )
    }
}

function loadGoogleAnalytics() {
  if (
    googleAnalyticsLoaded
  ) {
    return
  }

  googleAnalyticsLoaded =
    true

  createGtag()

  /*
   * Nu folosim Google Ads.
   */
  window.gtag(
    'consent',
    'default',
    {
      analytics_storage:
        'granted',

      ad_storage:
        'denied',

      ad_user_data:
        'denied',

      ad_personalization:
        'denied',
    },
  )

  window.gtag(
    'js',
    new Date(),
  )

  window.gtag(
    'config',
    GA_MEASUREMENT_ID,
    {
      /*
       * Page view-ul îl trimitem noi,
       * fiindcă site-ul folosește #/duba/...
       */
      send_page_view:
        false,
    },
  )

  const script =
    document.createElement(
      'script',
    )

  script.async = true

  script.src =
    `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`

  script.dataset.catAnalytics =
    'true'

  document.head.appendChild(
    script,
  )
}

export function setGoogleAnalyticsEnabled(
  enabled,
) {
  googleAnalyticsAllowed =
    enabled === true

  if (
    googleAnalyticsAllowed
  ) {
    loadGoogleAnalytics()

    if (
      window.gtag
    ) {
      window.gtag(
        'consent',
        'update',
        {
          analytics_storage:
            'granted',

          ad_storage:
            'denied',

          ad_user_data:
            'denied',

          ad_personalization:
            'denied',
        },
      )
    }

    return
  }

  /*
   * Dacă utilizatorul retrage
   * ulterior consimțământul.
   */
  if (
    googleAnalyticsLoaded &&
    window.gtag
  ) {
    window.gtag(
      'consent',
      'update',
      {
        analytics_storage:
          'denied',

        ad_storage:
          'denied',

        ad_user_data:
          'denied',

        ad_personalization:
          'denied',
      },
    )
  }
}

/* ==========================================
   GA4 PAGE VIEW
========================================== */

export function trackGooglePageView(
  options = {},
) {
  if (
    !googleAnalyticsAllowed
  ) {
    return
  }

  loadGoogleAnalytics()

  window.gtag(
    'event',
    'page_view',
    {
      page_title:
        options.pageTitle ||
        document.title,

      page_location:
        window.location.href,

      page_path:
        `${window.location.pathname}${window.location.search}${window.location.hash}`,
    },
  )
}

/* ==========================================
   GA4 EVENIMENTE
========================================== */

export function trackGoogleEvent(
  eventName,
  parameters = {},
) {
  if (
    !googleAnalyticsAllowed
  ) {
    return
  }

  loadGoogleAnalytics()

  window.gtag(
    'event',
    eventName,
    parameters,
  )
}

/* ==========================================
   EVENIMENT MIX:
   SUPABASE + GA4 DACĂ ESTE ACCEPTAT
========================================== */

export function trackInteraction(
  eventName,
  options = {},
) {
  /*
   * Supabase:
   * se execută indiferent de
   * consimțământul GA.
   */

  trackSiteEvent(
    eventName,
    {
      pageKey:
        options.pageKey,

      vehicleId:
        options.vehicleId,

      vehicleSlug:
        options.vehicleSlug,
    },
  )

  /*
   * GA4:
   * numai dacă utilizatorul
   * a acceptat Analiză.
   */

  trackGoogleEvent(
    eventName,
    {
      vehicle_id:
        options.vehicleId ||
        undefined,

      vehicle_slug:
        options.vehicleSlug ||
        undefined,

      vehicle_name:
        options.vehicleName ||
        undefined,

      interaction_location:
        options.location ||
        undefined,
    },
  )
}