import SwiftUI

@main struct MayrMarket:App {
    @State private var shop = Shop()
    var body:some Scene {WindowGroup {Market(shop:shop).environment(\.locale,Locale(identifier:"ru_RU")).environment(\.timeZone,cityZone)}}
}
enum Page:String {case catalog,favorites,cart,account,address,settings,about,orders,login,checkout}
enum Panel:Equatable {case stores,product(Int),filters,sort,subs,receipt(String)}
struct Market:View {
    let shop:Shop
    @State var page=Page.catalog, panel:Panel?, draftStore:Int?
    @State var category="all", query="", sub="", order="Популярные", photoOnly=false, kgOnly=false, limit=60
    @State var favoriteSort="Недавно добавленные"
    @State var path:[Page]=[]
    @AppStorage("native-dark") var dark=false
    @State var rows:[Item]=[]
    @State var categoryRows:[String:[Item]]=[:]
    @FocusState var searching:Bool
    func go(_ p:Page) { searching=false; panel=nil; path.append(page); page=p }
    func back(){page=path.popLast() ?? .catalog; panel=nil}
    var home:Bool { shop.memory.store == nil && category=="all" && query.isEmpty }
    var selectedName:String {shop.memory.store.map{shop.catalog.stores[$0]} ?? "Все магазины"}
    var body:some View {
        ZStack(alignment:.bottom) {
            (page == .checkout ? Color.surface : Color.paper).ignoresSafeArea()
            Group {
                switch page {
                case .checkout: Checkout(shop:shop,back:back){ id in page = .orders; path=[.account]; panel = .receipt(id) }
                case .address: AddressPage(shop:shop,back:back)
                case .login: LoginPage(shop:shop,back:back)
                default:
                    ScrollView {
                        VStack(alignment:.leading,spacing:16) {
                            if [.orders,.about,.settings].contains(page){backButton}
                            switch page {
                            case .catalog: catalogView
                            case .favorites: favoritesView
                            case .cart: cartView
                            case .account,.settings,.about,.orders: accountView
                            default: EmptyView()
                            }
                        }.padding(.horizontal,16).padding(.top,page == .catalog ? 8 : 24).padding(.bottom,102).frame(maxWidth:.infinity,alignment:.leading)
                    }.id(page).scrollDismissesKeyboard(.interactively)
                }
            }.frame(maxWidth:.infinity,maxHeight:.infinity)
            if ![.checkout,.login].contains(page) && !searching { tabbar }
            if let panel {
                Color.black.opacity(0.49).ignoresSafeArea().onTapGesture {self.panel=nil}
                sheetBody(panel)
                    .padding(.bottom,4).background(Color.surface).clipShape(UnevenRoundedRectangle(topLeadingRadius:28,topTrailingRadius:28))
                    .background(alignment:.bottom){Color.surface.frame(height:50).offset(y:48)}
                    .transition(.move(edge:.bottom))
            }
        }.font(type(15)).foregroundStyle(Color.ink).buttonStyle(.plain)
        .preferredColorScheme(dark ? .dark : .light)
        .animation(.easeOut(duration:0.2),value:panel)
        .onAppear {
            if categoryRows.isEmpty {
                for p in shop.catalog.items where !p.photo.isEmpty && (categoryRows[p.cat]?.count ?? 0)<12 {categoryRows[p.cat,default:[]].append(p)}
            }
            filter()
        }
        .onChange(of:query){_,_ in category="all";sub="";filter()}
    }
    var backButton:some View {Button(action:back){Glyph("back",26).frame(width:32,height:40)}.accessibilityLabel("Назад")}
    var tabbar:some View {
        HStack(spacing:4) {
            tab(.catalog,"Главная","house",0); tab(.favorites,"Избранное","heart",shop.memory.favorites.count)
            tab(.cart,shop.count>0 ? rub(Double(shop.total)) : "Корзина","cart",shop.count)
            tab(.account,"Аккаунт","user",0)
        }.padding(6).background(.ultraThinMaterial,in:Capsule()).background(Color.surface.opacity(0.65),in:Capsule()).padding(.horizontal,14).padding(.bottom,10)
    }
    func tab(_ target:Page,_ title:String,_ icon:String,_ badge:Int)->some View {
        let active=page==target || (target == .account && [.about,.settings,.orders,.address].contains(page))
        return Button { page=target;path=[];panel=nil } label:{
            VStack(spacing:2){
                Glyph(icon,21).overlay(alignment:.topTrailing){if badge>0 {Text("\(badge)").font(type(10,700)).foregroundStyle(.white).padding(.horizontal,4).background(.red,in:Capsule()).offset(x:10,y:-4)}}
                Text(title).font(type(11,700)).lineLimit(1)
            }.foregroundStyle(active ? Color.accentBlue : Color.muted).frame(maxWidth:.infinity,minHeight:52).background(active ? Color.tintSoft : .clear,in:Capsule())
        }.accessibilityIdentifier("tab-"+target.rawValue)
    }
    func header(_ title:String)->some View {Text(title).font(type(30,800)).tracking(-1)}
    func filter() {
        let words=query.lowercased().replacingOccurrences(of:"ё",with:"е").split(separator:" ")
        var list=shop.catalog.items.filter{ p in
            let hay=(p.name+" "+p.sub+" "+(shop.departments[p.cat]?.name ?? "")).lowercased().replacingOccurrences(of:"ё",with:"е")
            return (shop.memory.store == nil || p.offers.contains{$0.store==shop.memory.store}) && (category=="all" || p.cat==category) && (sub.isEmpty || sub==p.sub) && (!photoOnly || !p.photo.isEmpty) && (!kgOnly || p.kg) && words.allSatisfy{hay.contains($0)}
        }
        switch order {case "Сначала дешевле":list.sort{$0.price<$1.price}; case "Сначала дороже":list.sort{$0.price>$1.price};case "По названию":list.sort{$0.name.localizedCompare($1.name) == .orderedAscending};default: list=list.filter{!$0.photo.isEmpty}+list.filter{$0.photo.isEmpty}}
        rows=list;limit=60
    }
    func chooseCat(_ id:String){category=id;sub="";filter()}
    @ViewBuilder var catalogView:some View {
        Button {draftStore=shop.memory.store;panel = .stores} label:{
            VStack(alignment:.leading,spacing:6){
                HStack(spacing:6){Text(selectedName).font(type(21,800));Glyph("down",14)}
                HStack(spacing:6){Circle().fill(.green).frame(width:8,height:8);Text(shop.memory.address.street.isEmpty ? "Сегодня до 01:00 · 60–90 мин" : shop.memory.address.street).font(type(14))}
            }
        }.accessibilityIdentifier("stores")
        HStack(spacing:12){Glyph("search",20).foregroundStyle(Color.muted);TextField("Найти товар",text:$query).focused($searching).submitLabel(.search);if !query.isEmpty{Button{query="";searching=false}label:{Glyph("x",16)}}}.padding(.horizontal,16).frame(height:48).tile()
        ScrollView(.horizontal){HStack(alignment:.top,spacing:8){
            circle("all","Все товары","cart","ffffff")
            ForEach(shop.catalog.categories){c in circle(c.id,c.name,c.icon,c.color)}
        }}.scrollIndicators(.hidden)
        if home {
            Text("Рекомендации для вас").font(type(23,800)).tracking(-0.6); grid(shop.recs)
            ForEach(shop.catalog.categories){c in
                if let items=categoryRows[c.id], !items.isEmpty {
                    HStack{Text(c.name).font(type(22,800));Spacer();Button("Все"){chooseCat(c.id)}}
                    ScrollView(.horizontal){LazyHStack(alignment:.top,spacing:12){ForEach(items){p in card(p).frame(width:150)}}}.scrollIndicators(.hidden)
                }
            }
        } else {
            header(!query.isEmpty ? "Поиск «\(query)»" : shop.departments[category]?.name ?? selectedName)
            HStack(spacing:5){
                if category != "all" { pill(sub.isEmpty ? "Подраздел" : sub,"down",.subs) }
                pill("Фильтры","filter",.filters);pill(order,"sort",.sort)
            }
            Text("\(rows.count) товаров").font(type(14)).foregroundStyle(Color.muted)
            if rows.isEmpty {Text("Ничего не найдено");Button("Сбросить фильтры"){query="";category="all";sub="";kgOnly=false;photoOnly=false;shop.memory.store=nil;filter()}}
            grid(Array(rows.prefix(limit)))
            if rows.count>limit {Button("Показать ещё \(min(60,rows.count-limit))"){limit+=60}.primaryAction()}
        }
    }
    func circle(_ id:String,_ name:String,_ icon:String,_ color:String)->some View {
        Button{chooseCat(id)} label:{VStack(spacing:6){
            CategoryImage(icon:icon).frame(width:44,height:44).frame(width:70,height:70).background(Color(hex:color),in:Circle()).overlay(Circle().strokeBorder(id==category ? Color.accentBlue : .clear,lineWidth:3))
            Text(name).font(type(12,600)).lineLimit(2).multilineTextAlignment(.center).foregroundStyle(id==category ? Color.accentBlue : Color.ink)
        }.frame(width:72)}.accessibilityIdentifier("cat-"+id)
    }
    func pill(_ name:String,_ icon:String,_ target:Panel)->some View {Button{panel=target}label:{HStack(spacing:5){Glyph(icon,14);Text(name).font(type(12,600)).lineLimit(1);Glyph("down",10)}.frame(maxWidth:.infinity,minHeight:40).tile(.surface,24)}}
    func grid(_ items:[Item])->some View {LazyVGrid(columns:[GridItem(.flexible(),spacing:12),GridItem(.flexible())],alignment:.leading,spacing:20){ForEach(items){card($0)}}}
    func card(_ p:Item)->some View {
        VStack(alignment:.leading,spacing:4) {
            Color.white.aspectRatio(1,contentMode:.fit).overlay{ProductPhoto(item:p,icon:shop.departments[p.cat]?.icon ?? "basket").padding(16)}
                .clipShape(RoundedRectangle(cornerRadius:22)).onTapGesture{panel = .product(p.id)}
                .accessibilityElement().accessibilityLabel(p.name).accessibilityAddTraits(.isButton).accessibilityIdentifier("open-\(p.id)")
                .overlay(alignment:.topTrailing){Button{shop.favorite(p)} label:{Glyph(shop.memory.favorites.contains(p.id) ? "heart" : "heart-o",24).foregroundStyle(shop.memory.favorites.contains(p.id) ? .red : Color.muted).frame(width:36,height:36)}.padding(6).accessibilityLabel("В избранное")}
                .overlay(alignment:.bottomTrailing){qty(p).padding(10)}
                .overlay(alignment:.topLeading){if p.old>p.price {Text("−\(Int(((1-p.price/p.old)*100).rounded()))%").font(type(12,700)).foregroundStyle(.white).padding(4).tile(.red,8).padding(8)}}
            HStack{Text(rub(p.price)).font(type(18,800));if p.old>p.price{Text(rub(p.old)).strikethrough().font(type(12)).foregroundStyle(Color.muted)}}.padding(.top,6)
            Button(p.name){panel = .product(p.id)}.font(type(14)).lineLimit(2).multilineTextAlignment(.leading)
            Text(shop.storeName(p)+(p.kg ? " · за 1 кг" : "")+(shop.available(p)<=5 ? " · осталось "+amount(shop.available(p),p.kg) : "")).font(type(12)).foregroundStyle(Color.muted)
            Spacer(minLength:0)
        }.frame(maxWidth:.infinity,maxHeight:.infinity,alignment:.topLeading)
    }
    func qty(_ p:Item,_ full:Bool=false)->some View {
        let q=shop.memory.cart[p.id,default:0]
        return HStack(spacing:4){
            if q>0 {Button{shop.adjust(p,-1)}label:{Glyph("minus",15).frame(width:30,height:36)}.accessibilityLabel("Меньше");Text(p.kg ? amount(q,true) : "\(Int(q))").font(type(13,700))}
            Button{shop.adjust(p,1)}label:{HStack{Glyph("plus",16);if full && q==0 {Text("В корзину").font(type(15,700))}}.padding(.horizontal,full ? 8 : 0).frame(minWidth:q==0 ? 42 : 30,minHeight:42)}.disabled(q>=shop.available(p)).accessibilityIdentifier("add-\(p.id)").accessibilityLabel("В корзину")
        }.foregroundStyle(.white).background(Color.accentBlue,in:Capsule())
    }
}
