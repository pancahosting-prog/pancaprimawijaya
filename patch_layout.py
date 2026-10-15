with open("App.tsx", "r", encoding="utf-8") as f:
    lines = f.readlines()

new_lines = []
i = 0
while i < len(lines):
    line = lines[i]
    
    # 1. Category Button
    if 'px-4 py-2 flex items-center cursor-pointer hover:bg-slate-200 transition-colors group' in line:
        new_lines.append("""                               px-3 py-1.5 mx-1 rounded-md flex items-center cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors group\n""")
        i += 1
        continue

    # 2. Category background active
    if "${openCategory === menu.category ? 'bg-slate-100' : ''}" in line:
        new_lines.append("                               ${openCategory === menu.category ? 'bg-zinc-100/60 dark:bg-zinc-900/60 font-medium' : ''}\n")
        i += 1
        continue

    # 3. Category label
    if '<span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{menu.category}</span>' in line:
        new_lines.append('                                <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{menu.category}</span>\n')
        i += 1
        continue

    # 4. Category chevron
    if "className={`text-slate-400 transition-transform duration-200 ${openCategory === menu.category ? 'rotate-180' : ''}`}" in line:
        new_lines.append("                                   className={`text-zinc-400 dark:text-zinc-500 transition-transform duration-200 ${openCategory === menu.category ? 'rotate-180' : ''}`}\n")
        i += 1
        continue

    # 5. Menu item in sidebar (lines 4879-4894)
    if 'py-2.5 cursor-pointer border-l-4 transition-all flex items-center' in line:
        # replace the whole item div style
        new_lines.append("""                                           my-0.5 mx-1 py-2 px-2.5 rounded-md cursor-pointer transition-colors flex items-center text-xs font-medium\n""")
        new_lines.append("                                           ${(!isSidebarCollapsed || isMobileMenuOpen) ? 'gap-2.5' : 'justify-center px-0'}\n")
        new_lines.append("                                           ${activeView === item.id \n")
        new_lines.append("                                               ? 'bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 shadow-xs' \n")
        new_lines.append("                                               : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100'}\n")
        new_lines.append("                                       `}\n")
        new_lines.append("                                       title={item.label}\n")
        new_lines.append("                                    >\n")
        new_lines.append("""                                        <div className="flex items-center gap-2.5">\n""")
        new_lines.append("                                            {Icon && <Icon size={15} className={`${activeView === item.id ? 'text-zinc-50 dark:text-zinc-900' : 'text-zinc-400 dark:text-zinc-500'}`} />}\n")
        new_lines.append("                                            {(!isSidebarCollapsed || isMobileMenuOpen) && (\n")
        new_lines.append("""                                                <span className="truncate">{item.label}</span>\n""")
        new_lines.append("                                            )}\n")
        new_lines.append("                                        </div>\n")
        new_lines.append("                                    </div>\n")
        # skip until line 4894
        while i < len(lines) and '                                    </div>' not in lines[i]:
            i += 1
        i += 1 # skip the closing div
        continue

    # 6. Tutorial section
    if 'TUTORIAL' in line and '<h3' in line:
        new_lines.append("""                <div className="mt-3 mb-4 mx-1 border-t border-zinc-100 dark:border-zinc-800/80 pt-3">
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
                 </div>\n""")
        # skip lines until the end of the tutorial block
        while i < len(lines) and not ('                    </div>' in lines[i] and '                </div>' in lines[i+1]):
            i += 1
        i += 2 # skip both closing divs
        continue

    # 7. Main container
    if '<main className="flex-1 flex flex-col bg-white min-w-0">' in line:
        new_lines.append('          <main className="flex-1 flex flex-col bg-zinc-50/50 dark:bg-zinc-950 min-w-0">\n')
        i += 1
        continue

    # 8. Context Header
    if '<div className="h-10 border-b border-slate-200 flex items-center px-4 bg-white shrink-0">' in line:
        new_lines.append("""              {/* Context Header / Breadcrumbs */}
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
              </div>\n""")
        while i < len(lines) and '              </div>' not in lines[i]:
            i += 1
        i += 1 # skip closing div
        continue

    # 9. Search Box
    if 'className="relative w-full md:w-64">' in line:
        new_lines.append("""                        <div className="relative w-full md:w-72">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500 pointer-events-none"/>
                            <input 
                                type="text" 
                                placeholder="Cari data..." 
                                className="pl-9 pr-3 py-1.5 text-xs border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 rounded-md w-full md:w-72 outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100 placeholder:text-zinc-400 text-zinc-900 dark:text-zinc-100 transition-colors shadow-xs"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>\n""")
        while i < len(lines) and '<Search size={14}' not in lines[i]:
            i += 1
        i += 2 # skip Search line and its parent closing div
        continue

    new_lines.append(line)
    i += 1

with open("App.tsx", "w", encoding="utf-8") as f:
    f.writelines(new_lines)
print("Layout patched successfully!")
