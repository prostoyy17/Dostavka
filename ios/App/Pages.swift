import SwiftUI

extension Market {
    @ViewBuilder func sheetBody(_ kind:Panel)->some View {
        VStack(alignment:.leading,spacing:12) {
            HStack{Text(sheetTitle(kind)).font(type(22,800));Spacer();Button{panel=nil}label:{Glyph("x",15).frame(width:38,height:38).background(Color.soft,in:Circle())}.accessibilityLabel("Закрыть")}
            switch kind {
            case .stores:
                ForEach([-1]+Array(shop.catalog.stores.indices),id:\.self){i in
                    let selected=(draftStore ?? -1)==i
                    Button {draftStore=i<0 ? nil : i} label:{
                        HStack(spacing:14){if i>=0 {Image(i==0 ? "musafir-clear":"vkusdom-mark").resizable().scaledToFit().frame(width:80,height:44)}
                            Text(i<0 ? "Все магазины" : shop.catalog.stores[i]).font(type(15,700));Spacer()
                            Circle().strokeBorder(selected ? Color.accentBlue : Color.line,lineWidth:selected ? 5 : 1).frame(width:17,height:17)
                        }.padding(.horizontal,14).frame(height:64).tile(selected ? .tintSoft : .surface,14).overlay(RoundedRectangle(cornerRadius:14).stroke(selected ? Color.accentBlue : .line))
                    }.accessibilityIdentifier("store-\(i)")
                }
                VStack(alignment:.leading,spacing:8){HStack{Text("Грозный").font(type(16,700));Spacer();Text("60–90 мин").font(type(14,700))}
                    HStack{Text("Доставка по Грозному");Spacer();Text(openAt(Date()) ? "Открыто":"Закрыто").foregroundStyle(.white).padding(5).tile(openAt(Date()) ? .green : .gray,8)}
                    Text("09:00–01:00 · доставка 200 ₽, от 3 000 ₽ бесплатно").font(type(12)).foregroundStyle(Color.muted)
                }.padding(14).tile(.tintSoft,16)
                Button{shop.memory.store=draftStore;category="all";query="";sub="";filter();panel=nil}label:{Text("Готово").primaryAction()}
            case .filters:
                choice("Только с фото",photoOnly){photoOnly.toggle();filter()}
                choice("Весовые товары",kgOnly){kgOnly.toggle();filter()}
            case .sort:
                ForEach(["Популярные","Сначала дешевле","Сначала дороже","По названию"],id:\.self){s in choice(s,s==order){order=s;filter();panel=nil}}
            case .subs:
                ScrollView {VStack{ForEach([""]+(shop.departments[category]?.subs ?? []),id:\.self){s in choice(s.isEmpty ? "Все" : s,s==sub){sub=s;filter();panel=nil}}}}.frame(maxHeight:360)
            case .product(let id):
                if let p=shop.byID[id] {
                    ScrollView {
                        VStack(alignment:.leading,spacing:14){
                            ProductPhoto(item:p,icon:shop.departments[p.cat]?.icon ?? "basket",large:true).frame(maxWidth:.infinity).frame(height:192).padding(.vertical,24).background(.white)
                            Text(p.name).font(type(23,800));if p.kg{Text("Цена за 1 кг").foregroundStyle(Color.muted)}
                            HStack{HStack(spacing:5){CategoryImage(icon:shop.departments[p.cat]?.icon ?? "cart").frame(width:16,height:16);Text(shop.departments[p.cat]?.name ?? "")}.padding(6).tile(.soft,8);if !p.sub.isEmpty {Text(p.sub).padding(6).tile(.soft,8)}}.font(type(13,600))
                            VStack(spacing:4){ForEach(p.offers.indices,id:\.self){i in pair(shop.catalog.stores[p.offers[i].store],rub(p.offers[i].price)).padding(9).tile(.soft,8).overlay(RoundedRectangle(cornerRadius:8).stroke(i==0 ? Color.accentBlue:.clear))};pair("Наличие",shop.available(p)>20 ? "В наличии":amount(shop.available(p),p.kg)).padding(9).tile(.soft,8)}
                            if p.kg {Text(shop.memory.cart[p.id].map{"В корзине "+amount($0,true)+" — ≈ "+rub($0*p.price)} ?? (rub(p.price)+" за 1 кг · шаг 0,5 кг")).font(type(14)).foregroundStyle(Color.muted)}
                            HStack{Text(rub(p.price)).font(type(22,800));Spacer();qty(p,true);Button{shop.favorite(p)}label:{Glyph(shop.memory.favorites.contains(id) ? "heart":"heart-o")}.frame(width:48,height:48).tile(.soft,12).accessibilityLabel("Сохранить товар")}
                            Text("Ещё в категории").font(type(18,700));grid(Array(shop.catalog.items.lazy.filter{$0.cat==p.cat && $0.id != p.id}.prefix(4)))
                        }
                    }.containerRelativeFrame(.vertical){height,_ in height*0.80}
                }
            case .receipt(let id):
                if let r=shop.memory.orders.first(where:{$0.id==id}) {
                    Text("Заказ №\(id) отправлен").font(type(24,800));Text("Продавец проверит наличие и свяжется с вами.")
                    pair("Адрес",r.address);pair("Оплата",r.pay);pair("Сумма",rub(Double(r.total)))
                    Button("Продолжить"){panel=nil}.primaryAction()
                }
            }
        }.padding(.horizontal,22).padding(.vertical,16)
    }
    func sheetTitle(_ p:Panel)->String {switch p{case .stores:"Выбор магазина";case .filters:"Фильтры";case .sort:"Сортировка";case .subs:"Подраздел";default:""}}
    func choice(_ title:String,_ on:Bool,_ action:@escaping ()->Void)->some View {Button(action:action){HStack{Text(title);Spacer();if on {Glyph("check",16)}}.padding(12).tile(on ? .tintSoft:.soft,10)}}
    func pair(_ label:String,_ value:String)->some View {HStack(alignment:.firstTextBaseline){Text(label);Spacer();Text(value).font(type(15,700)).multilineTextAlignment(.trailing)}}
    @ViewBuilder var favoritesView:some View {
        let items=shop.memory.favorites.compactMap{shop.byID[$0]}
        header("Избранное")
        if items.isEmpty {empty("heart","В избранном пусто","Нажмите на сердечко на карточке товара")}
        else {
            Picker("Сортировка",selection:$favoriteSort){ForEach(["Недавно добавленные","Сначала дешевле","Сначала дороже","По названию"],id:\.self){Text($0)}}.tint(.accentBlue)
            Text("В наличии: \(items.filter{shop.available($0)>0}.count) из \(items.count)").font(type(14))
            HStack{Button("Очистить"){shop.memory.favorites=[]};Spacer();Button("Всё в корзину"){for p in items where shop.memory.cart[p.id]==nil {shop.adjust(p,1)}}}.padding().tile()
            grid(favoriteSort=="Сначала дешевле" ? items.sorted{$0.price<$1.price} : favoriteSort=="Сначала дороже" ? items.sorted{$0.price>$1.price} : favoriteSort=="По названию" ? items.sorted{$0.name<$1.name} : items)
        }
    }
    func empty(_ icon:String,_ title:String,_ note:String)->some View {VStack(spacing:12){Glyph(icon,40);Text(title).font(type(21,800));Text(note).foregroundStyle(Color.muted);Button("В каталог"){page = .catalog}.primaryAction()}.frame(maxWidth:.infinity).padding(24).tile()}
    @ViewBuilder var cartView:some View {
        HStack{header("Корзина");Spacer();if shop.count>0 {Button("Очистить"){shop.memory.cart=[:]}.foregroundStyle(Color.muted)}}
        if shop.count==0 {empty("cart","Корзина пуста","Добавьте товары из каталога")} else {
            VStack{pair(shop.subtotal<3000 ? "До бесплатной доставки "+rub(Double(3000-shop.subtotal)):"Бесплатная доставка","60–90 мин");ProgressView(value:min(1,Double(shop.subtotal)/3000)).tint(.accentBlue)}.padding(14).tile()
            ForEach(shop.lines){l in HStack(spacing:10){
                Button{panel = .product(l.id)}label:{ProductPhoto(item:l.item,icon:shop.departments[l.item.cat]?.icon ?? "basket").padding(6).frame(width:64,height:64)}
                VStack(alignment:.leading,spacing:3){Text(l.item.name).font(type(14,600));Text(shop.storeName(l.item)+" · "+rub(l.item.price)+(l.item.kg ? " / кг":"")).font(type(11)).foregroundStyle(Color.muted);Text((l.item.kg ? "≈ ":"")+rub(Double(l.sum))).font(type(14,700))}
                Spacer(minLength:0)
                HStack(spacing:5){Button{shop.adjust(l.item,-1)}label:{Glyph("minus",12).frame(width:32,height:32).background(Color.surface,in:Circle())};Text(l.item.kg ? amount(l.quantity,true):"\(Int(l.quantity))");Button{shop.adjust(l.item,1)}label:{Glyph("plus",12).frame(width:32,height:32).background(Color.surface,in:Circle())}}.font(type(14,700)).padding(4).tile(.soft,20)
            }.padding(12).tile()}
            pair("Товары, \(shop.lines.count) поз.",rub(Double(shop.subtotal))).padding(.top,14);pair("Доставка",shop.fee==0 ? "Бесплатно" : "200 ₽");Divider();pair("Итого",rub(Double(shop.total)))
            Button{go(.checkout)}label:{HStack{Text("Оформить");Spacer();Text(rub(Double(shop.total)))}.primaryAction()}.accessibilityIdentifier("checkout")
        }
    }
    func accountRow(_ label:String,_ icon:String,_ target:Page,_ detail:String="")->some View {Button{go(target)}label:{HStack(spacing:14){Glyph(icon).frame(width:40,height:40).tile(.soft,12);VStack(alignment:.leading){Text(label).font(type(detail.isEmpty ? 16:12,600));if !detail.isEmpty{Text(detail).font(type(16,700))}};Spacer();Glyph("chev",16)}.padding(.horizontal,18).frame(minHeight:70).background(Color.surface)}.accessibilityIdentifier("account-"+target.rawValue)}
    @ViewBuilder var accountView:some View {
        switch page {
        case .account:
            Spacer(minLength:10)
            if let u=shop.memory.accounts.first(where:{$0.phone==shop.memory.signedIn}) {pair(u.name,u.phone).padding().tile()}
            else {Button{go(.login)}label:{Text("Войти или зарегистрироваться").font(type(17,700)).foregroundStyle(.white).padding(.horizontal,30).frame(height:58).background(Color.accentBlue,in:Capsule())}.frame(maxWidth:.infinity).padding(.bottom,22)}
            accountRow("Адрес доставки","pin",.address,shop.memory.address.street.isEmpty ? "Не указан" : shop.memory.address.street).clipShape(RoundedRectangle(cornerRadius:22))
            VStack(spacing:1){accountRow("Мои заказы","receipt",.orders);accountRow("Настройки","gear",.settings);accountRow("О сервисе","info",.about)}.clipShape(RoundedRectangle(cornerRadius:22))
            if shop.memory.signedIn != nil {Button("Выйти из аккаунта"){shop.memory.signedIn=nil}}
            Spacer(minLength:12);VStack(spacing:4){(Text("Mayr").foregroundStyle(Color.muted)+Text("Market").foregroundStyle(Color.accentBlue)).font(type(22,800));Text("Версия 1.0").font(type(13)).foregroundStyle(Color.muted)}.opacity(0.65).frame(maxWidth:.infinity)
        case .settings: header("Настройки");Toggle("Тёмная тема",isOn:$dark).padding().tile().tint(.accentBlue)
        case .about:
            header("О сервисе");VStack(alignment:.leading,spacing:14){Text("MayrMarket — доставка продуктов по Грозному из магазинов города.");pair("Магазины",shop.catalog.stores.joined(separator:", "));pair("Часы доставки","09:00–01:00");pair("Время доставки","60–90 мин");pair("Доставка","200 ₽, от 3 000 ₽ бесплатно");pair("Товаров в каталоге","\(shop.catalog.items.count)")}.padding().tile()
            Link("Иконки: Uicons by Flaticon",destination:URL(string:"https://www.flaticon.com/uicons")!)
        case .orders:
            header("Мои заказы")
            if shop.memory.orders.isEmpty {empty("receipt","Заказов пока нет","")}
            ForEach(shop.memory.orders){r in VStack(alignment:.leading,spacing:12){Text("№\(r.id) · Грозный").font(type(17,700));Text(r.address);pair("Отправлен продавцу",rub(Double(r.total)));HStack{Button("Подробнее"){panel = .receipt(r.id)};Spacer();Button("Повторить"){for l in r.lines {if let p=shop.byID[l.id]{shop.set(p,(shop.memory.cart[p.id] ?? 0)+l.quantity)}};go(.cart)}}}.padding().tile()}
        default: EmptyView()
        }
    }
}
