with open("App.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update Sidebar Category header
old_sidebar_cat = """                                px-4 py-2 flex items-center cursor-pointer hover:bg-slate-200 transition-colors group
                                ${(!isSidebarCollapsed || isMobileMenuOpen) ? 'justify-between' : 'justify-center'}
                                ${openCategory === menu.category ? 'bg-slate-100' : ''}
                            `}
                            title={menu.category}
                         >
                             {(!isSidebarCollapsed || isMobileMenuOpen) ? (
                                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{menu.category}</span>
                             ) : (
                                 <div className="w-1.5 h-1.5 rounded-full bg-slate-300 group-hover:bg-violet-400 transition-colors"></div>
                             )}
                             
                             {(!isSidebarCollapsed || isMobileMenuOpen) && (
                                 <ChevronDown 
                                    size={12} 
                                    className={`text-slate-400 transition-transform duration-200 ${openCategory === menu.category ? 'rotate-180' : ''}`}
                                />
                             )}
                         </div>"""

new_sidebar_cat = """                                px-3 py-1.5 mx-1 rounded-md flex items-center cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors group
                                ${(!isSidebarCollapsed || isMobileMenuOpen) ? 'justify-between' : 'justify-center'}
                                ${openCategory === menu.category ? 'bg-zinc-100/60 dark:bg-zinc-900/60 font-medium' : ''}
                            `}
                            title={menu.category}
                         >
                             {(!isSidebarCollapsed || isMobileMenuOpen) ? (
                                 <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{menu.category}</span>
                             ) : (
                                 <div className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-600 group-hover:bg-zinc-900 dark:group-hover:bg-zinc-200 transition-colors"></div>
                             )}
                             
                             {(!isSidebarCollapsed || isMobileMenuOpen) && (
                                 <ChevronDown 
                                    size={12} 
                                    className={`text-zinc-400 dark:text-zinc-500 transition-transform duration-200 ${openCategory === menu.category ? 'rotate-180' : ''}`}
                                />
                             )}
                         </div>"""

# 2. Update Sidebar menu item
old_sidebar_item = """                                        className={`
                                            py-2.5 cursor-pointer border-l-4 transition-all flex items-center
                                            ${(!isSidebarCollapsed || isMobileMenuOpen) ? 'pl-8 pr-4' : 'justify-center px-0'}
                                            ${activeView === item.id 
                                                ? 'bg-white text-violet-700 font-bold border-l-violet-600 shadow-sm' 
                                                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border-l-transparent'}
                                        `}
                                        title={item.label}
                                     >
                                         <div className="flex items-center gap-3">
                                             {Icon && <Icon size={16} className={`${activeView === item.id ? 'text-violet-600' : 'text-slate-400'}`} />}
                                             {(!isSidebarCollapsed || isMobileMenuOpen) && (
                                                 <span className="text-xs whitespace-nowrap">{item.label}</span>
                                             )}
                                         </div>
                                     </div>"""

new_sidebar_item = """                                        className={`
                                            my-0.5 mx-1.5 py-2 px-2.5 rounded-md cursor-pointer transition-colors flex items-center text-xs font-medium
                                            ${(!isSidebarCollapsed || isMobileMenuOpen) ? 'gap-2.5' : 'justify-center px-0'}
                                            ${activeView === item.id 
                                                ? 'bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 shadow-xs' 
                                                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100'}
                                        `}
                                        title={item.label}
                                     >
                                         <div className="flex items-center gap-2.5">
                                             {Icon && <Icon size={15} className={`${activeView === item.id ? 'text-zinc-50 dark:text-zinc-900' : 'text-zinc-400 dark:text-zinc-500'}`} />}
                                             {(!isSidebarCollapsed || isMobileMenuOpen) && (
                                                 <span className="truncate">{item.label}</span>
                                             )}
                                         </div>
                                     </div>"""

# 3. Update Sidebar tutorial section
old_sidebar_tut = """                <div className="mt-4 mb-6 border-t border-slate-200 pt-4">
                     <div className="mb-2">
                          <h3 className={`font-black uppercase text-slate-400 tracking-widest ${(!isSidebarCollapsed || isMobileMenuOpen) ? 'px-8 text-[10px]' : 'text-[8px] text-center'}`}>
                              {(!isSidebarCollapsed || isMobileMenuOpen) ? 'TUTORIAL' : 'TUTORIAL'}
                          </h3>
                     </div>
                     <div className="flex flex-col space-y-1">
                         <div 
                            onClick={() => {
                                setActiveView('Tutorial');
                                if (window.innerWidth < 1024) setIsMobileMenuOpen(false);
                            }}
                            className={`
                                py-2.5 cursor-pointer border-l-4 transition-all flex items-center
                                ${(!isSidebarCollapsed || isMobileMenuOpen) ? 'pl-8 pr-4' : 'justify-center px-0'}
                                ${activeView === 'Tutorial' 
                                    ? 'bg-amber-50 text-amber-600 font-bold border-l-amber-500 shadow-sm' 
                                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border-l-transparent'}
                            `}
                            title="Tutorial & Bantuan"
                         >
                             <div className="flex items-center gap-3">
                                 <Lightbulb size={16} className={`${activeView === 'Tutorial' ? 'text-amber-500' : 'text-slate-400'}`} />
                                 {(!isSidebarCollapsed || isMobileMenuOpen) && (
                                     <span className="text-xs font-bold whitespace-nowrap">Tutorial & Bantuan</span>
                                 )}
                             </div>
                         </div>
                     </div>
                 </div>"""

new_sidebar_tut = """                <div className="mt-3 mb-4 mx-1.5 border-t border-zinc-100 dark:border-zinc-800/80 pt-3">
                     <div 
                        onClick={() => {
                            setActiveView('Tutorial');
                            if (window.innerWidth < 1024) setIsMobileMenuOpen(false);
                        }}
                        className={`
                            my-0.5 py-2 px-2.5 rounded-md cursor-pointer transition-colors flex items-center text-xs font-medium
                            ${(!isSidebarCollapsed || isMobileMenuOpen) ? 'gap-2.5' : 'justify-center px-0'}
                            ${activeView === 'Tutorial' 
                                ? 'bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 shadow-xs' 
                                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100'}
                        `}
                        title="Panduan & Bantuan"
                     >
                         <div className="flex items-center gap-2.5">
                             <Lightbulb size={15} className={`${activeView === 'Tutorial' ? 'text-zinc-50 dark:text-zinc-900' : 'text-zinc-400 dark:text-zinc-500'}`} />
                             {(!isSidebarCollapsed || isMobileMenuOpen) && (
                                 <span className="truncate">Panduan & Bantuan</span>
                             )}
                         </div>
                     </div>
                 </div>"""

# 4. Update Main Content Container & Header
old_main_header = """          {/* Content Area */}
          <main className="flex-1 flex flex-col bg-white min-w-0">
              
              {/* Context Header */}
              <div className="h-10 border-b border-slate-200 flex items-center px-4 bg-white shrink-0">
                  <span className="text-sm font-bold text-slate-700">{activeModule}:</span>
                  <span className="text-sm text-slate-500 ml-1">
                      {activeView}
                      {activeView === 'Recycle Bin' && recycleBinCategory !== 'All' && (
                          <span className="ml-2 bg-rose-50 text-rose-600 px-2 py-0.5 rounded-full text-[10px] font-bold border border-rose-100 inline-flex items-center gap-1">
                               {recycleBinCategory}
                               <button onClick={() => setRecycleBinCategory('All')} className="hover:bg-rose-200 rounded-full p-0.5">
                                   <X size={10} />
                               </button>
                           </span>
                       )}
                   </span>
               </div>"""

new_main_header = """          {/* Content Area */}
          <main className="flex-1 flex flex-col bg-zinc-50/50 dark:bg-zinc-950 min-w-0">
              
              {/* Context Header / Breadcrumbs */}
              <div className="h-11 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between px-6 bg-white dark:bg-zinc-900 shrink-0">
                  <div className="flex items-center gap-2 text-xs">
                      <span className="font-medium text-zinc-400 dark:text-zinc-500">{activeModule}</span>
                      <span className="text-zinc-300 dark:text-zinc-700">/</span>
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">{activeView}</span>
                      {activeView === 'Recycle Bin' && recycleBinCategory !== 'All' && (
                          <span className="ml-2 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 px-2 py-0.5 rounded-md text-[11px] font-medium border border-rose-200 dark:border-rose-900 inline-flex items-center gap-1">
                              {recycleBinCategory}
                              <button onClick={() => setRecycleBinCategory('All')} className="hover:bg-rose-200 dark:hover:bg-rose-900 rounded-sm p-0.5">
                                  <X size={10} />
                              </button>
                          </span>
                      )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                      <button 
                        onClick={() => {
                          if (currentUser) {
                            fetchData();
                          }
                        }}
                        className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
                        title="Segarkan Data"
                      >
                        <RefreshCw size={13} className={isSyncing ? 'animate-spin' : ''} />
                      </button>
                  </div>
              </div>"""

# 5. Filter bar search input
old_search_box = """                     <div className="relative w-full md:w-auto flex gap-2">
                        <div className="relative w-full md:w-64">
                            <button className="absolute left-0 top-0 h-full px-2 bg-[#2C3E50] text-white rounded-l-sm"><ChevronDown size={14}/></button>
                            <input 
                                type="text" 
                                placeholder="Search..." 
                                className="pl-10 pr-3 py-1.5 text-sm border border-slate-300 rounded-sm w-full md:w-64 outline-none focus:border-blue-500"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                            <Search size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"/>
                        </div>"""

new_search_box = """                     <div className="relative w-full md:w-auto flex gap-2">
                        <div className="relative w-full md:w-72">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500 pointer-events-none"/>
                            <input 
                                type="text" 
                                placeholder="Cari data..." 
                                className="pl-9 pr-3 py-1.5 text-xs border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 rounded-md w-full md:w-72 outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100 placeholder:text-zinc-400 text-zinc-900 dark:text-zinc-100 transition-colors shadow-xs"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>"""

# 6. Filter bar container
old_filter_container = """              {/* Filter Bar (Hidden for Dashboard) */}
              {activeView !== 'Dashboard' && (
                <div className="p-3 border-b border-slate-200 bg-[#FAFAFA] flex flex-wrap gap-3 items-center shrink-0">"""

new_filter_container = """              {/* Filter Bar (Hidden for Dashboard) */}
              {activeView !== 'Dashboard' && (
                <div className="px-6 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/40 backdrop-blur-xs flex flex-wrap gap-2.5 items-center shrink-0">"""

# 7. Main content padding container
old_content_container = """              {/* Main Content Area: Dashboard or Table */}
              <div className="flex-1 overflow-auto bg-[#FAFAFA] p-4">"""

new_content_container = """              {/* Main Content Area: Dashboard or Table */}
              <div className="flex-1 overflow-auto bg-zinc-50/60 dark:bg-zinc-950 p-4 sm:p-6">"""

# Replace all
for name, old, new in [
    ("sidebar_cat", old_sidebar_cat, new_sidebar_cat),
    ("sidebar_item", old_sidebar_item, new_sidebar_item),
    ("sidebar_tut", old_sidebar_tut, new_sidebar_tut),
    ("main_header", old_main_header, new_main_header),
    ("filter_container", old_filter_container, new_filter_container),
    ("search_box", old_search_box, new_search_box),
    ("content_container", old_content_container, new_content_container),
]:
    if old in content:
        content = content.replace(old, new)
        print(f"Replaced {name}")
    else:
        print(f"FAILED TO FIND {name}")

# Also replace hardcoded bg-[#2C3E50] button
content = content.replace(
    'className="bg-[#2C3E50] hover:bg-[#1a252f] text-white text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm"',
    'className="bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-50 dark:hover:bg-zinc-200 text-zinc-50 dark:text-zinc-900 text-xs font-medium px-3.5 py-1.5 rounded-md flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer active:scale-[0.98]"'
)

# Replace table card background in all views:
content = content.replace(
    'bg-white rounded-2xl shadow-sm border border-slate-100',
    'bg-white dark:bg-zinc-900/90 rounded-xl shadow-xs border border-zinc-200/80 dark:border-zinc-800'
)
content = content.replace(
    'bg-white p-6 rounded-2xl shadow-sm border border-slate-100',
    'bg-white dark:bg-zinc-900/90 p-6 rounded-xl shadow-xs border border-zinc-200/80 dark:border-zinc-800'
)
content = content.replace(
    'bg-white p-4 rounded-2xl shadow-sm border border-slate-100',
    'bg-white dark:bg-zinc-900/90 p-4 rounded-xl shadow-xs border border-zinc-200/80 dark:border-zinc-800'
)

with open("App.tsx", "w", encoding="utf-8") as f:
    f.write(content)
print("Updated App.tsx successfully!")
