/* Koroma Leone Tech — precise business module defaults shared by owner and workspace screens. */
(function (global) {
  'use strict';

  const GROUP_DEFAULTS = {
    'retail and trading': ['sales_pos','inventory','purchasing','customers','suppliers','expenses','accounting'],
    'food, hospitality and entertainment': ['sales_pos','inventory','purchasing','customers','suppliers','expenses','accounting','restaurant','appointments'],
    'hospitals and healthcare facilities': ['hospital','healthcare','pharmacy','appointments','employees','accounting','compliance'],
    'healthcare and pharmaceutical': ['sales_pos','inventory','purchasing','customers','suppliers','expenses','accounting','pharmacy','healthcare','compliance'],
    'automotive and transport': ['sales_pos','inventory','purchasing','customers','suppliers','expenses','accounting','transport','fleet','services'],
    'construction and industrial': ['sales_pos','inventory','purchasing','customers','suppliers','expenses','accounting','manufacturing','projects'],
    'professional and personal services': ['sales_pos','customers','suppliers','expenses','employees','accounting','services','appointments','projects'],
    'education and training': ['sales_pos','inventory','purchasing','customers','suppliers','expenses','employees','accounting','school'],
    'agriculture and fisheries': ['sales_pos','inventory','purchasing','customers','suppliers','expenses','accounting','manufacturing'],
    'property and rental': ['customers','suppliers','expenses','accounting','property','projects','services'],
    'financial and administrative services': ['customers','expenses','employees','accounting','compliance','services'],
    'sports and local league management': ['sports_league','expenses','employees','accounting','customers','suppliers'],
    'travel, visa and overseas employment services': ['travel_agency','customers','expenses','employees','accounting','compliance'],
    'general and multi-industry': ['sales_pos','inventory','purchasing','customers','suppliers','expenses','employees','accounting','services','projects']
  };

  function modulesFor(industryGroup, businessType) {
    const type = String(businessType || '').trim().toLowerCase();
    const group = String(industryGroup || '').trim().toLowerCase();
    let modules = null;

    if (/(travel agency|visa and immigration|overseas recruitment|job placement agency|labour migration|travel and tour operator)/.test(type)) {
      modules = ['travel_agency','customers','expenses','employees','accounting','compliance'];
    } else if (/(hospital|clinic|health centre|health center|medical centre|medical center|diagnostic|laboratory|maternity|dental clinic)/.test(type)) {
      modules = ['hospital','healthcare','pharmacy','appointments','employees','accounting','compliance'];
    } else if (type === 'pharmacy') {
      modules = ['sales_pos','inventory','purchasing','customers','suppliers','expenses','accounting','pharmacy','healthcare','compliance'];
    } else if (/(medical supply|medical equipment|optical shop|dental supply|healthcare product)/.test(type)) {
      modules = ['sales_pos','inventory','purchasing','customers','suppliers','expenses','accounting','pharmacy','healthcare','compliance'];
    } else if (/(school management system|training centre|vocational institution|computer training centre|driving school)/.test(type)) {
      modules = ['school','employees','accounting','expenses','customers','appointments'];
    } else if (/(educational supply|bookshop and learning)/.test(type)) {
      modules = ['sales_pos','inventory','purchasing','customers','suppliers','expenses','accounting'];
    } else if (/(football club|sports club)/.test(type)) {
      modules = ['football_club_manager','employees','expenses','accounting','customers','suppliers'];
    } else if (/(league|sports academy|sports association|federation|sports event|community league)/.test(type)) {
      modules = ['sports_league','employees','expenses','accounting','customers','suppliers'];
    } else if (/(vehicle rental|vehicle hire|transport and logistics|delivery business)/.test(type)) {
      modules = ['transport','fleet','services','projects','employees','customers','suppliers','expenses','accounting'];
    } else if (/(hotel|guesthouse|lodge)/.test(type)) {
      modules = ['sales_pos','inventory','purchasing','customers','suppliers','expenses','employees','accounting','restaurant','appointments'];
    } else if (/(restaurant|fast-food|cafeteria|bakery|pastry|bar or lounge|catering|ice cream|beverage)/.test(type)) {
      modules = ['sales_pos','inventory','purchasing','customers','suppliers','expenses','employees','accounting','restaurant','appointments'];
    } else if (/(event and entertainment)/.test(type)) {
      modules = ['customers','suppliers','expenses','employees','accounting','services','appointments','projects'];
    } else if (/(hair salon|barbershop|beauty salon|spa)/.test(type)) {
      modules = ['sales_pos','customers','expenses','employees','accounting','services','appointments'];
    } else if (/(laundry|cleaning company|security service|repair and maintenance|computer repair|printing business|photography|consultancy|marketing and advertising)/.test(type)) {
      modules = ['customers','suppliers','expenses','employees','accounting','services','appointments','projects'];
    } else if (/(real estate|property management|property maintenance|equipment rental|event equipment rental)/.test(type)) {
      modules = ['customers','suppliers','expenses','employees','accounting','property','projects','services'];
    } else if (/(accounting and bookkeeping|insurance agency|microfinance|cooperative society|business administration)/.test(type)) {
      modules = ['customers','expenses','employees','accounting','compliance','services'];
    } else if (/(construction company|building contractor)/.test(type)) {
      modules = ['inventory','purchasing','customers','suppliers','expenses','employees','accounting','projects'];
    } else if (/(furniture manufacturer|manufacturing company|food processing|welding and fabrication)/.test(type)) {
      modules = ['sales_pos','inventory','purchasing','customers','suppliers','expenses','employees','accounting','manufacturing','projects'];
    } else if (/(farm business|poultry farm|livestock business|fish farm|fishing supply|agricultural produce)/.test(type)) {
      modules = ['sales_pos','inventory','purchasing','customers','suppliers','expenses','employees','accounting','manufacturing'];
    } else if (/(fuel station|car dealership|vehicle spare-parts|auto repair|tyre shop|car wash)/.test(type)) {
      modules = /(auto repair|car wash)/.test(type)
        ? ['customers','suppliers','expenses','employees','accounting','services','appointments','inventory','purchasing']
        : ['sales_pos','inventory','purchasing','customers','suppliers','expenses','accounting'];
    }

    if (!modules) modules = GROUP_DEFAULTS[group] || GROUP_DEFAULTS['general and multi-industry'];
    return Array.from(new Set(['core', ...modules])).sort();
  }

  function dashboardPages(industry, moduleKeys) {
    const keys = moduleKeys instanceof Set ? moduleKeys : new Set(moduleKeys || []);
    const type = String(industry || '').toLowerCase();
    if (keys.has('travel_agency') || /(travel agency|visa and immigration|overseas recruitment|job placement agency|labour migration|travel and tour operator)/.test(type)) return ['travel-agency','employees','billing','settings'];
    if (keys.has('football_club_manager') || /football club|sports club/.test(type)) {
      return ['club-website-studio','football-player-network','settings'];
    }
    if (keys.has('hospital')) return ['hospital','employees','billing','settings'];
    if (keys.has('school')) return ['school','employees','reports-centre','settings'];
    if (keys.has('sports_league')) return ['league','employees','reports-centre','settings'];
    if (keys.has('transport') || keys.has('fleet')) return ['customers','suppliers','expenses','reports-centre'];
    if (keys.has('property')) return ['customers','expenses','reports-centre','settings'];
    const pages = [];
    if (keys.has('sales_pos')) pages.push('sales');
    if (keys.has('inventory')) pages.push('products');
    if (keys.has('purchasing')) pages.push('purchases');
    if (keys.has('customers')) pages.push('customers');
    if (keys.has('expenses')) pages.push('expenses');
    if (keys.has('employees')) pages.push('employees');
    if (keys.has('school')) pages.push('school');
    if (keys.has('hospital')) pages.push('hospital');
    return Array.from(new Set(pages)).slice(0, 4);
  }

  global.KLTBusinessModuleProfiles = Object.freeze({ modulesFor, dashboardPages });
})(window);
