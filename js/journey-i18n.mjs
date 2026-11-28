let language='en';
const zh={
'Video title':'视频标题','Video title (defaults to journey name)':'视频标题（留空时使用行程名称）',
'Car model / name (optional)':'车型 / 车名（可选）','e.g. Subaru Outback / My road-trip car':'例如：Subaru Outback / 我的小车',
'Route playback':'路线动画','Play journey':'播放行程','Pause journey':'暂停播放','Resume journey':'继续播放','Replay journey':'重播行程','Replay from the start':'从头重播','Playback progress':'播放进度','Follow on map':'地图跟随','Speed':'速度','Animation speed':'动画速度','Ready to play':'准备播放','Playing':'正在播放','Paused':'已暂停','Finished':'播放结束','Segment {index} of {total}':'路段 {index} / {total}',

'Drag the globe to explore; scroll to zoom.':'拖拽地球浏览各地，滚轮缩放。',
'Map':'地图','Globe':'地球','Globe view · drag to explore; scroll to zoom.':'地球视角 · 拖拽浏览，滚轮缩放。','3D and globe need WebGL. This device uses a 2D overview.':'3D 和地球视角需要 WebGL，当前设备显示 2D 概览。',
'Itinerary editor':'行程编辑器','This file is not valid KML.':'此文件不是有效的 KML。','A track contains invalid coordinates.':'轨迹包含无效坐标。','Skipped a line with fewer than two coordinates.':'已跳过不足两个坐标的线条。','An unsupported time was retained in metadata; edit its date before exporting.':'不支持的时间已保留在元数据中，请在导出前修改日期。','The saved notebook is not a supported Journey Studio file.':'保存的手记不是受支持的 Journey Studio 文件。',
'Wanderlust':'玩嘚儿了~','JOURNEY STUDIO':'行程工作室','Journey Studio | Bing Zhou':'行程工作室 | Bing Zhou',
'Skip to itinerary editor':'跳到行程编辑器','A place for the journeys ahead.':'把向往，变成下一段旅程。','♧ Bucket List':'♧ 心愿清单','Back to Wanderlust':'返回玩嘚儿了~','Settings':'设置','Close settings':'关闭设置','MAKE IT YOURS':'你的旅行，你的偏好','Your preferences are saved on this device.':'偏好设置会自动保存在这台设备上。','Language':'语言','Distance units':'距离单位','Metric · km':'公制 · km','Imperial · mi':'英制 · mi','Done':'完成',
'GRIND Lab (opens in a new tab)':'GRIND Lab（在新标签页打开）','Visit GRIND Lab':'访问 GRIND Lab','YOUR FIELD NOTES':'我的旅行手记','＋ New journey':'＋ 新建行程','Saved journeys':'已保存的行程','Journey name':'行程名称','My next adventure':'我的下一段旅程','Untitled journey':'未命名行程','Start with a place. See where it takes you.':'从一个地点开始，看看旅程通向哪里。','Import KML':'导入 KML','Review & export':'检查并导出',
'Journey colors':'行程配色','Choose a palette for all journeys, or personalize each color.':'为所有行程选择一组配色，也可逐条自定义颜色。','Color palette':'配色方案','Show all journeys on the map':'在地图上显示所有行程','Trail tones':'山野色调','Coastal':'海岸','Sunset':'日落','Vivid':'缤纷','Color for {name}':'{name}的颜色',
'Add to your journey':'添加到行程','Add a segment or point':'添加路段或独立地点','Route segment':'路段','Place / point':'地点 / 点位','Travel by':'出行方式','Car':'汽车','Train':'火车','Plane':'飞机','Walk':'步行','Route':'路线','Starting point':'起点','Destination':'终点','City, address, or lat, lon':'城市、地址或纬度, 经度','Where to next?':'下一站去哪儿？','Find':'搜索','Search starting point':'搜索起点','Search destination':'搜索终点','Place suggestions':'候选地点','Important node':'重要节点','Dates & notes':'时间与备注','Departure (local time)':'出发时间（当地时间）','Arrival (local time)':'到达时间（当地时间）','Notes':'备注','Find route options':'查找路线方案','Cancel route replacement':'取消替换路段','Compare road routes, including suggested detours where available.':'比较道路路线，包括可用的绕行方案。','Compare geographic planning sketches, directly or via suggested hubs. These are not verified services or rail-track routes.':'比较直达或经中转地点的地理规划示意线；并非已核实的班次或铁路轨迹。','Compare walking routes along the pedestrian network.':'沿步行路网比较路线方案。',
'Find a place':'查找地点','Place name or lat, lon':'地点名称或纬度, 经度','Choose a point on the map':'在地图上选点','Label':'名称','A place worth remembering':'一个值得记住的地方','Visit / start (local time)':'到访 / 开始（当地时间）','End (optional)':'结束（可选）','Add place':'添加地点','Route alternatives':'备选路线','The itinerary':'行程清单','Fit map':'适合地图范围','Route segments':'路段','No route segments yet.':'还没有路段。','Saved places':'独立地点','Independent pins, separate from the route.':'单独保存的标记，不参与路径连线。','No saved places yet.':'还没有独立地点。','Your next chapter starts here.':'下一段故事，从这里开始。','Search two places for a route, or pin a place you love.':'搜索起终点规划路线，或标记喜欢的地点。',
'Opening your local notebook…':'正在打开本地旅行手记…','Connect a local folder':'连接本地文件夹','Connected folder':'已连接的文件夹','Saved folder · reconnect to sync':'已保存的文件夹 · 重新连接以同步','Shown from the selected folder; the full disk path is private to your browser.':'显示所选文件夹内的路径；浏览器不提供完整磁盘路径。','Your journeys stay on this device. Export KML to keep a separate copy.':'行程保存在此设备上，也可导出 KML 单独备份。','Delete this journey':'删除当前行程','About local storage':'关于本地存储','Automatically saved in this browser. For a hidden folder on disk, open this page in desktop Chrome or Edge.':'自动保存在此浏览器中。要同步到磁盘隐藏文件夹，请使用桌面版 Chrome 或 Edge。',
'Journey map':'行程地图','Interactive map':'交互地图','Journey overview. Drag to pan; use plus and minus to zoom.':'行程概览。拖拽平移，使用加减按钮缩放。','MAKE ROOM FOR A LITTLE':'给生活留一点','Place':'地点','Journey':'行程','Map theme':'地图主题','Classic':'经典','Minimal':'简约','Bright':'明亮','Night':'夜色','Map view':'地图视角','Zoom in':'放大','Zoom out':'缩小','Fit journey':'显示完整行程','Loading your map…':'正在加载地图…','Fix the map':'纠正地图',
'Edit place':'编辑地点','Edit route segment':'编辑路段','Close editor':'关闭编辑器','Name':'名称','Latitude':'纬度','Longitude':'经度','Starting point is important':'起点是重要节点','Destination is important':'终点是重要节点','Changing transport keeps the existing geometry. Use “Replace route” to search new endpoints or route options.':'修改交通方式会保留现有路径。点击“替换路线”可重新搜索起终点和路线。','Time / start (ISO 8601)':'时间 / 开始（ISO 8601）','Replace route':'替换路线','Save changes':'保存修改','Ready for the journey?':'准备好出发了吗？','Close export review':'关闭导出检查','I have reviewed this itinerary.':'我已检查此行程。','Export KML':'导出 KML',
'COLLECT MOMENTS, NOT THINGS':'收藏经历，珍藏回忆','The National Parks Bucket List':'国家公园心愿清单','The Fifty States Bucket List':'美国 50 州心愿清单','Close Bucket List':'关闭心愿清单','Bucket List collection':'心愿清单类别','National parks':'国家公园','US states':'美国各州','Poster title':'海报标题','Find a park':'查找公园','Find a state':'查找州','Search parks or states':'搜索公园或州','Search states or abbreviations':'搜索州名或缩写','Select all':'全选','Clear all':'全部清除','National Park Service list':'美国国家公园管理局清单','· Updated November 2026':'· 更新于 2026 年 11 月','All 50 US states, including Alaska and Hawaii. Washington, DC and territories are not states.':'包含阿拉斯加、夏威夷在内的美国 50 州。华盛顿特区和属地不计入。','Poster design':'海报设计','CHOOSE YOUR COVER':'选择你的封面','One collection. Four ways to tell it.':'一份足迹，四种表达。','Poster template':'海报模板','Field notes':'旅行手记','Topographic journal':'等高线日记','After dark':'星夜','Celestial cartography':'星空地图','Postcard':'明信片','Vintage road trip':'复古公路之旅','Modern atlas':'现代地图集','Editorial travel print':'旅行画报','Poster orientation':'海报方向','▯ Portrait':'▯ 竖版','▭ Landscape':'▭ 横版','Preview controls':'预览控制','Preview zoom':'预览缩放','Zoom out preview':'缩小预览','Zoom in preview':'放大预览','Fit':'适合窗口','Poster preview: scroll to zoom, drag to pan, double-click to zoom, Home to fit':'海报预览：滚轮缩放，拖拽平移，双击放大，Home 恢复适合窗口','Scroll to zoom · drag to pan · double-click to zoom · Home to fit':'滚轮缩放 · 拖拽平移 · 双击放大 · Home 恢复视图','Travel poster with a US map and the complete checklist':'包含美国地图和完整清单的旅行海报','Download JPG · {size}':'下载 JPG · {size}','Enable JavaScript to use the journey editor and save your itineraries.':'请启用 JavaScript 以编辑和保存行程。',
'Edit':'编辑','Locate':'定位','Earlier':'前移','Later':'后移','Remove':'移除','Place · {coords}':'地点 · {coords}','{segments} segments · {points} places{distance}':'{segments} 段路线 · {points} 个地点{distance}','Move {name} earlier':'将 {name} 前移','Move {name} later':'将 {name} 后移','Edit {name}':'编辑 {name}','Locate {name}':'定位 {name}','Remove {name}':'移除 {name}','Remove “{name}” from this journey?':'从行程中移除“{name}”？','Delete “{name}” from this notebook? Previously exported KML files are kept.':'从手记中删除“{name}”？此前导出的 KML 文件会保留。',
'Selected {name}.':'已选择 {name}。','Searching…':'搜索中…','Finding places…':'正在查找地点…','No matching places. Try a city, address, or coordinates.':'没有匹配地点，请尝试城市、地址或坐标。','No places found. Try a more specific name or latitude, longitude.':'未找到地点，请输入更具体的名称或纬度、经度。','{count} suggestions · use ↑ / ↓ and Enter to select.':'{count} 个候选地点 · 使用 ↑ / ↓ 和 Enter 选择。','Choose the matching place from the results.':'请在结果中选择匹配地点。','Comparing routes…':'正在比较路线…','Finding route options…':'正在查找路线方案…','{count} options found. Preview one, then add it to your itinerary.':'找到 {count} 个方案。预览后可添加到行程。','{count} distinct options available for these places. The service could not find three valid alternatives.':'这两个地点有 {count} 个不同方案，服务未找到三个有效备选。','{count} distinct option available for these places. The service could not find three valid alternatives.':'这两个地点有 {count} 个方案，服务未找到三个有效备选。','Replace this segment':'替换当前路段','Add selected segment':'添加所选路段','Segment saved. Continue from this destination, or add a place.':'路段已保存。可以从此终点继续规划，或添加独立地点。','Place saved to your journey.':'地点已保存到行程。','Choose new endpoints or a route. The existing segment stays in place until you confirm its replacement.':'请选择新的起终点或路线。确认替换前，现有路段会保留。','Add a segment or place before exporting.':'请先添加路段或地点，再导出。','{count} gap(s) between consecutive segments; exported as separate lines.':'相邻路段之间有 {count} 处间隔，将导出为独立线条。','Planning sketches are included as labeled geometries. Verify actual train / flight services separately.':'规划示意线会以带标签的几何图形导出，请另行核实火车 / 航班服务。','KML imported as a new journey. Your other journeys are preserved.':'KML 已作为新行程导入，其他行程已保留。','No matches. Try another name.':'没有匹配结果，请换个名称。','{count} of {total} parks explored':'已到访 {count} / {total} 个国家公园','{count} of {total} states explored':'已到访 {count} / {total} 个州','Preparing your travel print…':'正在准备旅行海报…','Map location selected. Give it a name and add it to the journey.':'已选中地图位置，命名后即可加入行程。','Click or tap a location on the map. You can also enter latitude, longitude.':'请点击地图上的位置，也可以输入纬度、经度。','Map selection cancelled.':'已取消地图选点。','Connected. Journeys and KML copies are saved in the hidden .wanderlust folder inside your chosen directory.':'已连接。行程和 KML 副本保存在所选目录的 .wanderlust 隐藏文件夹中。','KML exported with route modes, important nodes and time information.':'KML 已导出，包含出行方式、重要节点和时间信息。','Clear all visited parks from this Bucket List?':'清除心愿清单中所有已到访公园？','Clear all visited states from this Bucket List?':'清除心愿清单中所有已到访州？','Updated from another tab on this device.':'已同步此设备上另一个标签页的更新。',
'Saving locally…':'正在保存到本地…','Your local notebook is ready.':'本地旅行手记已就绪。','Saved on this device':'已保存在此设备上','Saved to .wanderlust':'已保存到 .wanderlust','Local storage unavailable. Export KML to keep your work.':'本地存储不可用，请导出 KML 保存成果。','Could not save. Export KML now to keep your work.':'保存失败，请立即导出 KML 保留成果。','Recovered available local data; an unreadable copy could not be restored.':'已恢复可用的本地数据，有一个无法读取的副本未能恢复。','Restored on this device · reconnect your folder to sync.':'已恢复本地数据 · 请重新连接文件夹以同步。','reconnect your folder to sync.':'请重新连接文件夹以同步。','Folder sync paused; reconnect the folder.':'文件夹同步已暂停，请重新连接。','Private file backup unavailable.':'浏览器文件备份不可用。','A KML copy needs valid dates before it can be refreshed.':'KML 副本需要有效日期才能更新。','Folder access is available in desktop Chrome or Edge over HTTPS (or localhost). Your notebook still saves in this browser.':'通过 HTTPS（或 localhost）使用桌面版 Chrome 或 Edge 可连接文件夹。旅行手记仍会保存在当前浏览器中。',
'Some map tiles are unavailable. Your itinerary is still editable.':'部分地图瓦片不可用，仍可编辑行程。','Offline overview · search and road routing need an internet connection.':'离线概览 · 地点搜索和路网查询需要联网。','Map overview · live WebGL map unavailable. Drag to pan and use + / − to zoom.':'地图概览 · WebGL 地图不可用。拖拽平移，使用 + / − 缩放。','3D needs WebGL. The overview is shown in 2D.':'3D 需要 WebGL，当前以 2D 概览显示。','Loading map theme…':'正在加载地图主题…','Map theme unavailable. Keeping the current map.':'该地图主题暂不可用，已保留当前地图。','3D view · right-drag to tilt / rotate; zoom in for buildings.':'3D 视角 · 右键拖拽倾斜 / 旋转，放大可查看建筑。',
'Imported geometry':'导入的路径','Imported KML':'导入的 KML','Planning sketch':'规划示意线','Direct planning sketch':'直达规划示意线','Plan via {name}':'经 {name} 的规划','Great-circle sketch; flight availability and connections are not verified.':'大圆航线示意，未核实航班和中转是否可用。','Geographic sketch; does not follow rail tracks. Verify service or import an actual rail KML.':'地理示意线，不沿铁路轨道。请核实班次，或导入实际铁路 KML。','Recommended road route':'推荐驾车路线','Alternative road route {number}':'备选驾车路线 {number}','Road detour via {coords}':'经 {coords} 绕行','Recommended walking route':'推荐步行路线','Alternative walking route {number}':'备选步行路线 {number}','Walking detour via {coords}':'经 {coords} 步行绕行','Road-network route. Traffic, road closures and travel conditions are not live.':'道路路线，不包含实时交通、封路或通行状况。','Pedestrian-network route. Check trail access, closures and conditions before walking.':'步行路网路线，请出发前确认步道通行、关闭和现场状况。','Looking for additional road routes via nearby waypoints…':'正在通过附近途经点查找其他驾车路线…','Looking for additional walking routes via nearby waypoints…':'正在通过附近途经点查找其他步行路线…',
'Coordinates must be latitude (−90 to 90), longitude (−180 to 180).':'坐标须为纬度（−90 至 90）、经度（−180 至 180）。','Enter at least two characters or a latitude, longitude pair.':'请输入至少两个字符，或一组纬度、经度坐标。','Place search is temporarily unavailable. Try coordinates or choose a point on the map.':'地点搜索暂不可用，请输入坐标或在地图上选点。','Road routing is unavailable. Try again, or import an existing route KML.':'驾车路线服务不可用，请重试或导入现有路线 KML。','Walking routing is unavailable. Try again, or import a walking KML.':'步行路线服务不可用，请重试或导入步行 KML。','No drivable route was found between these places.':'这两个地点之间未找到可驾车路线。','No walking route was found between these places.':'这两个地点之间未找到步行路线。','A place is too far from the road network. Choose a nearby road access point.':'地点离路网过远，请选择附近的道路入口。','A place is too far from the walking network. Choose a nearby trail or sidewalk.':'地点离步行路网过远，请选择附近步道或人行道。','Choose two different places, at least 10 metres apart.':'请选择相距至少 10 米的两个不同地点。','Use a valid ISO date or date/time, such as 2026-11-23 or 2026-11-23T09:00:00-05:00.':'请输入有效的 ISO 日期或时间，例如 2026-11-23 或 2026-11-23T09:00:00-05:00。','The end time must be after the start time.':'结束时间必须晚于开始时间。','Please import a KML smaller than 10 MB.':'请导入小于 10 MB 的 KML。','No editable points or line routes were found in this KML.':'此 KML 中没有可编辑的点或路径。','This KML contains invalid or out-of-range coordinates.':'此 KML 包含无效或超出范围的坐标。','KML with custom XML entities is not supported.':'不支持含自定义 XML 实体的 KML。','A place has invalid coordinates.':'某个地点的坐标无效。','A route needs at least two valid coordinates.':'路线需要至少两个有效坐标。','The poster could not be exported. Please try again.':'海报导出失败，请重试。','This browser cannot render the poster.':'此浏览器无法渲染海报。'
};
Object.assign(zh,{
 'Export map & routes':'导出地图与路线','Close map export':'关闭地图导出','SAVE THE JOURNEY':'收藏这段旅程','YOUR JOURNEYS, IN PRINT':'把旅程留在纸上','Journeys to include':'要导出的行程','Current journey':'当前行程','All journeys':'所有行程','Map extent':'地图范围','Fit selected journeys':'显示所选完整行程','Current map view':'当前地图视野','Layout':'版式','Map poster':'地图海报','Map only':'仅地图','Include saved places':'包含已保存地点','Show national parks':'显示国家公园','The map uses your current theme and view. All selected routes are exported in full.':'地图沿用当前主题和视角，并完整导出所选路线。','Map export preview':'地图导出预览','Map and route poster':'地图与路线海报','Download JPG':'下载 JPG','Download PNG':'下载 PNG','{count} journeys selected. KML includes routes and saved places.':'已选择 {count} 个行程。KML 包含路线和已保存地点。','Preparing your map print…':'正在准备地图海报…','Rendering full-resolution image…':'正在生成高分辨率图片…','The detailed map is unavailable. A local overview is shown.':'详细底图暂不可用，已使用本地概览地图。','The map could not be loaded. Please try again.':'地图加载失败，请重试。','The map could not be exported. Please try again.':'地图导出失败，请重试。',
 'Combined':'混合','Parks & States Bucket List':'国家公园与美国各州心愿清单','Find a park or state':'查找公园或州','Clear all visited parks and states from this Bucket List?':'清除心愿清单中所有已到访的公园和州？','National Park Service':'美国国家公园管理局',
 'Sample journeys':'示例行程','National parks, rail journeys and three flight examples.':'国家公园、铁路旅行，以及三段飞行示例。','Load test data':'加载测试数据','Loading test journeys…':'正在加载测试行程…','Added {count} sample journeys. Your existing journeys are kept.':'已添加 {count} 个示例行程，已有行程已保留。','Test journeys are already loaded.':'测试行程已加载，无需重复添加。','Test data could not be loaded. Please try again.':'测试数据加载失败，请重试。','Data sources & coverage':'数据来源与覆盖范围','Research sample':'研究资料示例','Test data':'测试数据'
});
// Templates translate generated UI text without ever translating saved names or notes.
Object.assign(zh,{
 'Show on map':'显示在地图上','All':'全部','None':'全不选','Click a name to edit. Check journeys to show them on the map.':'点击名称编辑行程，勾选控制地图显示。','Show {name} on map':'在地图上显示 {name}','Delete journey':'删除行程','Delete journey {name}':'删除行程 {name}',
 'Single color':'单一颜色','Single color for all journeys':'所有行程使用同一颜色','Checked journeys':'已勾选的行程','Map composition':'地图构图','These adjustments change the exported image.':'此处调整会应用到导出的图片。','Map scale':'地图缩放','Horizontal position':'水平位置','Vertical position':'垂直位置','Reset composition':'重置构图','Arrange map':'调整地图','Inspect poster':'查看海报','Preview interaction':'预览操作',
 'Drag the map to position it. Scroll to change its scale. Home resets the composition.':'拖拽地图调整位置，滚轮调整地图缩放，Home 重置构图。','The map uses your current theme and view. Image framing can crop routes; KML keeps their complete geometry.':'地图沿用当前主题和视角。图片构图可能裁切路线，KML 保留完整路线。','No journeys are checked. Choose another export selection or check a journey on the map.':'尚未勾选行程，请更改导出范围或勾选需要显示的行程。'
});
Object.assign(zh,{
'Journey notebook':'行程手记','Expand menu':'展开菜单','Pin menu':'固定菜单','Collapse menu':'收起菜单','Hide menu':'隐藏菜单','Show menu':'显示菜单','Itinerary collections':'行程内容','Hide playback controls':'隐藏播放控件','Show playback controls':'显示播放控件',
'Satellite · NASA':'卫星影像 · NASA','Satellite + labels':'卫星影像与地名','US topographic':'美国地形图','Global satellite imagery · approximately 500 m detail.':'全球卫星影像 · 约 500 米地表细节。','Global satellite imagery with place labels · approximately 500 m detail.':'带地名的全球卫星影像 · 约 500 米地表细节。','3D view · right-drag to tilt / rotate.':'3D 视角 · 右键拖拽倾斜 / 旋转。','Detailed US topographic map · USGS.':'美国详细地形图 · USGS。','The map is still loading. Please try exporting again.':'地图仍在加载，请稍后再次导出。'
});
Object.assign(zh,{"Import KML, KMZ or GeoJSON": "导入 KML、KMZ 或 GeoJSON", "Export KMZ": "导出 KMZ", "Export GeoJSON": "导出 GeoJSON", "File format": "文件格式", "Choose a KML, KMZ or GeoJSON file.": "请选择 KML、KMZ 或 GeoJSON 文件。", "Please import a file smaller than 10 MB.": "请导入小于 10 MB 的文件。", "This file is not valid GeoJSON.": "此文件不是有效的 GeoJSON。", "This file is not a readable KMZ archive.": "无法读取此 KMZ 压缩文件。", "This KMZ expands beyond the 50 MB limit.": "此 KMZ 解压后超过 50 MB 限制。", "No KML document was found in this KMZ.": "此 KMZ 中没有 KML 文档。", "GeoJSON must use WGS84 longitude and latitude.": "GeoJSON 必须使用 WGS84 经纬度坐标。", "This file contains invalid or out-of-range coordinates.": "此文件包含无效或超出范围的坐标。", "No editable points or line routes were found in this file.": "此文件中没有可编辑的点或路径。", "File imported as a new journey. Your other journeys are preserved.": "文件已作为新行程导入，其他行程已保留。", "Journey file exported.": "行程文件已导出。", "Select at least one itinerary item.": "请至少选择一个行程条目。", "0 selected": "已选 0 项", "{count} selected": "已选 {count} 项", "Clear": "清除", "Select {name}": "选择 {name}", "Hide {name} on map": "在地图上隐藏 {name}", "Hide on map": "在地图上隐藏", "Export {name}": "导出 {name}", "Export selected items": "导出所选条目", "Exit playback": "退出播放模式", "Pick starting point on map": "在地图上选择起点", "Pick destination on map": "在地图上选择终点", "Endpoint selected on the map.": "已在地图上选择起终点位置。", "Inset maps": "子地图", "Inset map": "子地图", "+ Add inset": "+ 添加子地图", "Add up to three detail maps. Drag or scroll inside an inset to adjust its view.": "最多添加三个子地图。在子地图内拖拽或滚动可调整视野。", "Inset title": "子地图标题", "Inset region": "子地图区域", "Choose region…": "选择区域…", "Alaska": "阿拉斯加", "Hawaii": "夏威夷", "Contiguous United States": "美国本土", "Inset zoom": "子地图缩放", "Inset position": "子地图位置", "Bottom right": "右下", "Bottom left": "左下", "Top right": "右上", "Top left": "左上", "Inset size": "子地图大小", "Remove inset": "删除子地图", "Inset {number}": "子地图 {number}"});
Object.assign(zh,{"Play checked journeys by date": "按时间连续播放已勾选行程", "Play checked journeys by route dates, then dates in names. Undated journeys play last.": "连续播放已勾选行程：优先按路段时间，其次按名称中的日期；无日期的行程最后播放。", "Itinerary items": "行程条目", "Journey {index} of {total}": "行程 {index} / {total}"});
Object.assign(zh,{"Countries & regions": "国家与地区", "The World Bucket List": "世界旅行心愿清单", "Find a country or region": "查找国家或地区", "Search names or country codes": "搜索中英文名称或国家代码", "Countries and regions, including small islands. Visited places are colored on the world map.": "涵盖全球国家与地区及小型岛屿；世界地图以彩色标示已到访地点。", "Map & checklist sources": "地图与清单来源", "Try again":"重试","Loading countries and regions…": "正在加载国家与地区…", "The world map could not be loaded. Please try again.": "世界地图加载失败，请重试。", "Clear all visited countries and regions from this Bucket List?": "清除心愿清单中所有已到访的国家与地区？", "{count} of {total} countries & regions explored": "已探索 {count} / {total} 个国家与地区", "Africa": "非洲", "Asia": "亚洲", "Europe": "欧洲", "North America": "北美洲", "South America": "南美洲", "Oceania": "大洋洲", "Antarctica": "南极洲"});
Object.assign(zh,{"Show my location": "显示当前位置", "Finding your location…": "正在获取当前位置…", "Current location · accuracy about {distance}": "当前位置 · 定位精度约 {distance}", "Location permission was denied. Allow location access in your browser settings and try again.": "定位权限被拒绝，请在浏览器设置中允许定位后重试。", "Your location is unavailable. Check your device location services and try again.": "暂时无法获取位置，请检查设备定位服务后重试。", "Finding your location timed out. Please try again.": "获取位置超时，请重试。", "Location needs HTTPS or localhost.": "定位需要使用 HTTPS 或 localhost。", "This browser does not support location access.": "当前浏览器不支持定位。", "Route list beside map": "在地图旁显示路线清单", "Hidden": "隐藏", "Right side": "右侧", "Left side": "左侧", "Too many routes for the side list. Choose fewer journeys or hide the route list.": "路线过多，无法完整放入侧边清单。请选择较少的行程，或隐藏路线清单。"});
const patterns=Object.entries(zh).filter(([key])=>key.includes('{')).map(([key,value])=>{
 const names=[];const pattern=key.split(/(\{\w+\})/).map(part=>{if(/^\{/.test(part)){names.push(part.slice(1,-1));return '(.*?)';}return part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}).join('');return {regex:new RegExp('^'+pattern+'$'),names,value};
});
export function t(message,values) {
 if(message==null)return '';let result=String(message);
 if(language==='zh'){
  if(Object.hasOwn(zh,result))result=zh[result];
  else {const match=patterns.map(p=>({p,m:result.match(p.regex)})).find(({m})=>m);if(match)result=match.p.value.replace(/\{(\w+)\}/g,(_,name)=>match.m[match.p.names.indexOf(name)+1]);
   else if(result.includes(' · '))result=result.split(' · ').map(part=>t(part)).join(' · ');
  }
 }
 return values?result.replace(/\{(\w+)\}/g,(_,key)=>values[key]??''):result;
}
export function setLanguage(value){language=value==='zh'?'zh':'en';document.documentElement.lang=language==='zh'?'zh-CN':'en';document.title=t('Journey Studio | Bing Zhou');}
export function captureStaticTranslations(root=document.body){
 const text=[],attributes=[],walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
 for(let node;node=walker.nextNode();)if(node.textContent.trim()&&!node.parentElement.closest('script,style,noscript'))text.push([node,node.textContent]);
 for(const node of root.querySelectorAll('[aria-label],[placeholder],[title]'))for(const name of ['aria-label','placeholder','title'])if(node.hasAttribute(name))attributes.push([node,name,node.getAttribute(name)]);
 return ()=>{for(const [node,source] of text)if(node.isConnected)node.textContent=source.replace(/\S[\s\S]*\S|\S/,match=>t(match));for(const [node,name,source] of attributes)if(node.isConnected)node.setAttribute(name,t(source));};
}
export function translatedStatus(node,message){node.dataset.message=message;node.textContent=t(message);}
export function refreshStatuses(){for(const node of document.querySelectorAll('[data-message]'))node.textContent=t(node.dataset.message);}

Object.assign(zh,{"Your travels, beautifully collected.":"把足迹，收藏成画。","Park Passport":"山野徽章","Collect the park badges":"收藏国家公园徽章","The park icons could not be loaded. Please select the template again to retry.":"公园图标加载失败，请重新选择此模板重试。"});

Object.assign(zh,{
  "YOUR JOURNEY IN MOTION": "让旅程动起来",
  "Export animation video": "导出动画视频",
  "Close video export": "关闭视频导出",
  "Video orientation": "视频方向",
  "Animation video preview": "动画视频预览",
  "Preview position": "预览位置",
  "Video export progress": "视频导出进度",
  "Export MP4": "导出 MP4",
  "Cancel export": "取消导出",
  "Download MP4 again": "再次下载 MP4",
  "Back to preview": "返回预览",
  "Fixed camera": "固定视角",
  "Checked journeys play in chronological order. Hidden segments are skipped. The current map theme, view, speed and Follow setting are used.": "已勾选的行程按时间顺序播放，跳过隐藏路段。沿用当前地图主题、视角、速度与跟随设置。",
  "To change the framing or speed, close this window and adjust the map or player.": "如需调整构图或速度，请关闭此窗口，在地图或播放器中修改。",
  "Select at least one journey with a visible route to export.": "请至少勾选一个包含可见路段的行程。",
  "Wait for the current map to finish loading, then try again.": "请等待当前地图加载完成后重试。",
  "Preparing video preview…": "正在准备视频预览…",
  "Preview and video use the same framing.": "预览与导出视频使用相同的构图。",
  "MP4 encoding is not available in this browser. Try the latest desktop Chrome or Edge.": "此浏览器不支持 MP4 编码。请使用最新桌面版 Chrome 或 Edge。",
  "This video needs more temporary storage. Free up browser storage or choose a faster playback speed.": "此视频需要更多临时存储空间，请清理浏览器存储或提高播放速度。",
  "{count} journeys · {segments} segments · {rate}× · {duration}": "{count} 个行程 · {segments} 段路线 · {rate}× · {duration}",
  "Rendering video… {percent}%": "正在生成视频… {percent}%",
  "Your MP4 is ready.": "MP4 已生成，可以播放预览或再次下载。",
  "Video export cancelled.": "已取消视频导出。"
});

Object.assign(zh,{'Preparing your MP4 download…':'正在准备 MP4 下载…'});

Object.assign(zh,{
  'Resolution':'分辨率','Frame rate':'帧率',
  'MP4 encoding is not available for these settings. Choose a lower resolution or frame rate, or try desktop Chrome or Edge.':'当前设置不支持 MP4 编码，请降低分辨率或帧率，或使用桌面版 Chrome / Edge。',
  'State Passport':'五十州徽章','Parks & States Passport':'公园与州徽章',
  'Collect the state badges':'收藏五十州徽章','Collect park and state badges':'收藏公园与州徽章',
  'The state icons could not be loaded. Please select the template again to retry.':'州图标加载失败，请重新选择此模板重试。'
});

Object.assign(zh,{
  'Departure date':'出发日期','Arrival date':'到达日期','Visit / start date':'到访 / 开始日期','Start date':'开始日期','End date (optional)':'结束日期（可选）',
  'Year and month':'年月','Day (optional)':'日（可选）','YYYY-MM':'年-月',
  'Year and month are enough; the day is optional.':'只需填写年月，具体日期可选。',
  'Enter a valid year and month, with an optional day.':'请输入有效的年月，日可不填；填写时需为有效日期。',
  'Choose a year and month before adding a day.':'请先填写年月，再填写日。',
  'The end date must not be before the start date.':'结束日期不能早于开始日期。'
});

Object.assign(zh,{'Enter MM-YYYY; the day is optional. Dates carry forward within this journey.':'输入 MM-YYYY，日可选。同一 Journey 的后续条目会沿用所选日期。'});

Object.assign(zh,{
  'Export checked journeys':'导出已勾选行程','Close batch export':'关闭批量导出',
  'Includes all routes and places in checked journeys, even hidden items.':'导出已勾选行程中的全部路段和地点，包括已隐藏的条目。',
  'Empty journeys have no routes or places to export and are skipped.':'空行程没有可导出的路段或地点，将自动跳过。',
  'Files':'文件组织方式','One file per journey (ZIP)':'每个行程单独成文件（ZIP 打包）','One combined file':'合并为一个文件',
  'Download ZIP':'下载 ZIP','Preparing files…':'正在准备文件…','Journey files exported.':'行程文件已导出。',
  '{count} journeys · {items} items':'{count} 个行程 · {items} 个条目','{count} items':'{count} 个条目',
  'Could not export {name}: {message}':'无法导出 {name}：{message}'
});

Object.assign(zh,{
 'Import one or more KML, KMZ or GeoJSON files':'导入一个或多个 KML、KMZ 或 GeoJSON 文件',
 'Importing {index} of {total}: {name}':'正在导入 {index}/{total}：{name}',
 'Imported {count} files as separate journeys.':'已将 {count} 个文件导入为独立行程。',
 'No journeys were imported.':'没有导入任何行程。',
 '{count} file(s) could not be imported.':'{count} 个文件导入失败。'
});

Object.assign(zh,{
  "Import one or more KML, KMZ, GeoJSON or ZIP files": "导入一个或多个 KML、KMZ、GeoJSON 或 ZIP 文件",
  "Please import a ZIP smaller than 50 MB.": "请导入小于 50 MB 的 ZIP 文件。",
  "This file is not a readable ZIP archive.": "无法读取此 ZIP 压缩文件。",
  "This ZIP contains more than 1,000 files.": "此 ZIP 包含超过 1,000 个文件。",
  "This ZIP expands beyond the 50 MB limit.": "此 ZIP 解压后超过 50 MB 限制。",
  "This ZIP contains no KML, KMZ or GeoJSON files.": "此 ZIP 中没有 KML、KMZ 或 GeoJSON 文件。",
  "Public": "公共交通",
  "Public transport": "公共交通",
  "Transport speeds": "交通方式速度",
  "Car is the 1× reference. Set each transport’s animation speed relative to the car. These settings also apply to exported videos.": "汽车为 1× 基准。其他交通方式的动画速度按汽车的倍数设置，并同步应用于导出视频。",
  "Base speed": "基准速度",
  "× car": "× 汽车",
  "Reset transport speeds": "恢复默认速度",
  "Geographic sketch; public transport routes and schedules are not verified. Import a route file for exact geometry.": "公共交通规划示意线，不代表实际线路或时刻表。可导入路线文件以使用准确路径。",
  "Public transport sketch ready. Import an existing route for exact geometry.": "公共交通示意线已准备好，可导入现有路线以使用准确路径。"
});

Object.assign(zh,{
 'YOUR RIDE':'你的座驾','Choose vehicle & color':'选择车型与颜色','Close vehicle picker':'关闭车型选择','Choose a model for the animation. Unlisted models use the black 1991 Porsche 911 Carrera 2 (964).':'为动画选择车型。未列出的车型使用黑色 1991 Porsche 911 Carrera 2 (964)。','Search model, year or color':'搜索车型、年份或颜色','e.g. Toyota, 2023, Blue':'例如 Toyota、2023、蓝色','Vehicle models':'车型图标','{count} vehicles':'{count} 款车型','No matching vehicles.':'没有匹配的车型。',
 'Connect your local folder':'连接本地文件夹','Close folder reminder':'关闭文件夹提示','Continue in browser':'继续使用浏览器','Connect folder':'连接文件夹','Reconnect folder':'重新连接文件夹','Choose another folder':'选择其他文件夹',
 'Folder permission was not granted. Allow access or choose another folder.':'尚未获得文件夹访问权限。请允许访问或选择其他文件夹。',
 'This browser saves journeys on this device, but cannot connect a local folder. Use desktop Chrome or Edge to enable folder sync.':'行程会保存在当前浏览器中，但此浏览器无法连接本地文件夹。请使用桌面版 Chrome 或 Edge 启用文件夹同步。',
 'The saved folder could not be read. Its files have been kept unchanged. Reconnect it or choose another folder.':'无法读取已保存的文件夹，其中的文件保持不变。请重新连接或选择其他文件夹。',
 'Your saved folder needs permission before it can sync. Reconnect to merge its journeys with this browser.':'已保存的文件夹需要重新授权才能同步。连接后会合并文件夹和当前浏览器中的行程。',
 'No local folder is connected. Choose a folder to sync your journeys and keep KML backups in its hidden .wanderlust folder.':'尚未连接本地文件夹。请选择文件夹，同步行程并在其中的隐藏 .wanderlust 文件夹内保存 KML 备份。',
 'Black':'黑色','White':'白色','Blue':'蓝色','Red':'红色','Gray':'灰色','Silver':'银色','Green':'绿色','Orange':'橙色','Bronze':'古铜色','Sand':'沙色','Beige':'米色','Dark Blue':'深蓝色','Dark Gray':'深灰色','Dark Red':'深红色','Light Blue':'浅蓝色','Olive Green':'橄榄绿','Pearl White':'珍珠白','Mudbath':'泥浴棕','Shock':'荧光黄绿','Navy Blue / Creme Light':'海军蓝 / 奶油白','Deep Blue / Silver':'深蓝 / 银色'
});
