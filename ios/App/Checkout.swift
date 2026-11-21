import SwiftUI
import PhotosUI
import CryptoKit

private let zones=["Ахматовский","Байсангуровский","Висаитовский","Шейх-Мансуровский"]
struct AddressFields:View {
    @Binding var address:Address
    var photosLocked=false
    @State private var picked:[PhotosPickerItem]=[]
    @State private var photoError=""
    var body:some View {
        VStack(alignment:.leading,spacing:10){
            HStack(spacing:3){kind(false,"Частный дом");kind(true,"Квартира / Офис")}.padding(4).tile(.soft,18)
            Field(label:"Улица и дом",value:$address.street)
            if address.flat {
                HStack{Field(label:"Квартира / Офис",value:$address.apt);Field(label:"Подъезд",value:$address.entrance)}
                HStack{Field(label:"Этаж",value:$address.floor);Field(label:"Домофон",value:$address.code)}
            }
            VStack(alignment:.leading,spacing:0){Text("Район").font(type(11,600)).foregroundStyle(Color.muted);Picker("Район",selection:$address.zone){ForEach(zones,id:\.self){Text($0)}}.tint(.ink)}.padding(.horizontal,12).frame(maxWidth:.infinity,minHeight:50,alignment:.leading).tile(.surface,10).overlay(RoundedRectangle(cornerRadius:10).stroke(Color.line))
            VStack(alignment:.leading,spacing:2){Text("Комментарий курьеру").font(type(11,600)).foregroundStyle(Color.muted);TextField("Комментарий",text:$address.comment,axis:.vertical).lineLimit(2...4)}.padding(12).frame(maxWidth:.infinity,minHeight:76,alignment:.topLeading).tile(.surface,10).overlay(RoundedRectangle(cornerRadius:10).stroke(Color.line))
            (Text("Фото дома или входа  ").font(type(14,700))+Text(photosLocked ? "из адреса доставки":"до 3 фото, по желанию").font(type(12)).foregroundStyle(Color.muted)).padding(.top,8)
            HStack{ForEach(Array(address.photos.enumerated()),id:\.offset){i,data in
                if let im=UIImage(data:data){Image(uiImage:im).resizable().scaledToFill().frame(width:76,height:76).clipped().clipShape(RoundedRectangle(cornerRadius:12)).overlay(alignment:.topTrailing){if !photosLocked {Button{address.photos.remove(at:i)}label:{Glyph("x",12).padding(5).background(.thinMaterial,in:Circle())}}}}
            }
                if !photosLocked && address.photos.count<3 {PhotosPicker(selection:$picked,maxSelectionCount:3-address.photos.count,matching:.images){VStack{Glyph("plus",15);Text("Добавить").font(type(12,600))}.frame(width:76,height:76).foregroundStyle(Color.muted).overlay(RoundedRectangle(cornerRadius:12).strokeBorder(style:StrokeStyle(lineWidth:1,dash:[4])))}}
            }
            if !photoError.isEmpty {Text(photoError).foregroundStyle(.red)}
        }.onChange(of:picked){_,selection in Task {
            for p in selection where address.photos.count<3 {
                if let data=try? await p.loadTransferable(type:Data.self),let im=UIImage(data:data),let thumb=await im.byPreparingThumbnail(ofSize:CGSize(width:1280,height:1280)),let jpeg=thumb.jpegData(compressionQuality:0.82){address.photos.append(jpeg)}else{photoError="Не удалось прочитать фото."}
            }
            if picked==selection {picked=[]}
        }}
    }
    func kind(_ flat:Bool,_ name:String)->some View {Button{address.flat=flat}label:{Text(name).font(type(14,700)).frame(maxWidth:.infinity,minHeight:44).foregroundStyle(flat==address.flat ? .white:Color.ink).tile(flat==address.flat ? .accentBlue:.clear,14)}}
}
func addressError(_ a:Address)->String? {
    if !a.street.contains(where:\.isNumber){return "Укажите улицу и номер дома."}
    if a.flat && a.apt.trimmingCharacters(in:.whitespaces).isEmpty{return "Укажите квартиру."}
    return nil
}
struct AddressPage:View {
    let shop:Shop, back:()->Void
    @State var a:Address
    @State var error=""
    init(shop:Shop,back:@escaping ()->Void){self.shop=shop;self.back=back;_a=State(initialValue:shop.memory.address)}
    var body:some View {ScrollView{VStack(alignment:.leading,spacing:16){Button(action:back){Glyph("back",26)}.accessibilityLabel("Назад");Text("Адрес доставки").font(type(30,800));AddressFields(address:$a);Text(error).foregroundStyle(.red);Button{if let e=addressError(a){error=e}else{shop.memory.address=a;back()}}label:{Text("Сохранить").primaryAction()}}.padding(16).padding(.bottom,100)}}
}
struct LoginPage:View {
    let shop:Shop,back:()->Void
    @State var register=false
    @State var name=""
    @State var phone=""
    @State var password=""
    @State var error=""
    @State var visible=false
    var body:some View {ScrollView{VStack(alignment:.leading,spacing:16){
        Button(action:back){Glyph("back",26)}.accessibilityLabel("Назад")
        Picker("Аккаунт",selection:$register){Text("Войти").tag(false);Text("Зарегистрироваться").tag(true)}.pickerStyle(.segmented)
        Text(register ? "Создать аккаунт":"Вход в аккаунт").font(type(28,800))
        if register {Field(label:"Имя",value:$name)};Field(label:"Телефон",value:$phone).keyboardType(.phonePad)
        HStack{if visible {TextField("Пароль",text:$password)}else{SecureField("Пароль",text:$password)};Button{visible.toggle()}label:{Glyph(visible ? "eyeoff":"eye",19)}}.padding().tile()
        Text(error).foregroundStyle(.red);Button(action:submit){Text(register ? "Зарегистрироваться":"Войти").primaryAction()}
    }.padding(18)}}
    func submit(){
        let number=phoneDigits(phone)
        guard number.count==10,password.count>=3 else{error="Проверьте телефон и пароль";return}
        func hash(_ salt:String)->String{SHA256.hash(data:Data((salt+password).utf8)).map{String(format:"%02x",$0)}.joined()}
        if register {
            guard !name.isEmpty,!shop.memory.accounts.contains(where:{$0.phone==number}) else{error="Проверьте имя и номер телефона";return}
            let salt=UUID().uuidString;shop.memory.accounts.append(Account(name:name,phone:number,salt:salt,hash:hash(salt)))
        }else if !shop.memory.accounts.contains(where:{$0.phone==number && $0.hash==hash($0.salt)}){error="Неверный телефон или пароль";return}
        shop.memory.signedIn=number;back()
    }
}
private func deliveryRange(_ now:Date=Date())->ClosedRange<Date> {
    let start=cityCalendar.startOfDay(for:now)
    let opening=start.addingTimeInterval(9*3600)
    var first=Date(timeIntervalSince1970:ceil((now.timeIntervalSince1970+3600)/60)*60)
    if !openAt(first){first=first<=opening ? opening:opening.addingTimeInterval(86400)}
    return first...start.addingTimeInterval(49*3600-60)
}
struct Checkout:View {
    let shop:Shop,back:()->Void,finished:(String)->Void
    @State var a:Address
    @State var scheduled:Bool
    @State var time:Date
    @State var pay="СБП"
    @State var change=""
    @State var leave=false
    @State var noCall=false
    @State var replacement="Позвонить и согласовать"
    @State var error=""
    @State var sending=false
    let hasPhotos:Bool
    init(shop:Shop,back:@escaping ()->Void,finished:@escaping (String)->Void){
        self.shop=shop;self.back=back;self.finished=finished;var draft=shop.memory.address
        if let u=shop.memory.accounts.first(where:{$0.phone==shop.memory.signedIn}){if draft.name.isEmpty{draft.name=u.name};if draft.phone.isEmpty{draft.phone="+7"+u.phone}}
        hasPhotos = !draft.photos.isEmpty
        _a=State(initialValue:draft)
        let soon=deliveryRange().lowerBound
        _time=State(initialValue:soon);_scheduled=State(initialValue:!openAt(Date()))
    }
    var body:some View { ScrollView{VStack(alignment:.leading,spacing:16){
        Button(action:back){Glyph("back",26)}.accessibilityLabel("Назад");Text("Оформление заказа").font(type(24,800))
        heading(1,"Адрес доставки · Грозный");AddressFields(address:$a,photosLocked:hasPhotos)
        heading(2,"Контакты");Field(label:"Имя",value:$a.name);Field(label:"Телефон",value:$a.phone).keyboardType(.phonePad)
        heading(3,"Время по Грозному");HStack{if openAt(Date()){option("Как можно скорее","60–90 мин",!scheduled){scheduled=false}};option("Выбрать время","",scheduled){scheduled=true}}
        if scheduled {scheduleFields}
        heading(4,"Оплата");HStack{option("СБП","При получении",pay=="СБП","qr"){pay="СБП"};option("Наличными","При получении",pay=="Наличными","cash"){pay="Наличными"}}
        if pay=="Наличными"{Field(label:"С какой суммы сдача",value:$change).keyboardType(.numberPad)}
        heading(5,"Дополнительно");Toggle("Оставить у двери",isOn:$leave);Toggle("Не звонить в домофон",isOn:$noCall)
        VStack(alignment:.leading){Text("Если товара не окажется").font(type(11,600));Picker("Замена",selection:$replacement){ForEach(["Позвонить и согласовать","Заменить на похожий","Убрать из заказа"],id:\.self){Text($0)}}}.tint(.ink)
        VStack(alignment:.leading,spacing:14){Text("Ваш заказ").font(type(19,800));ForEach(shop.lines){l in HStack{ProductPhoto(item:l.item,icon:shop.departments[l.item.cat]?.icon ?? "basket").frame(width:36,height:36);Text(l.item.name).font(type(13));Spacer();Text(amount(l.quantity,l.item.kg));Text(rub(Double(l.sum))).font(type(13,700))}};Divider();totalRow("Товары",shop.subtotal);totalRow("Доставка",shop.fee);totalRow("К оплате",shop.total);if !error.isEmpty{Text(error).foregroundStyle(.red)};Button{Task{await send()}}label:{HStack{Text(sending ? "Отправляем заказ…":"Отправить заказ");Spacer();Text(rub(Double(shop.total)))}.primaryAction()}.accessibilityIdentifier("send-order").disabled(sending)}.padding().tile(.soft)
    }.padding(16)}.scrollDismissesKeyboard(.interactively).tint(.accentBlue).disabled(sending)}
    var scheduleFields:some View {
        let bounds=deliveryRange()
        let first=cityCalendar.startOfDay(for:bounds.lowerBound)
        let days=(0...2).map{first.addingTimeInterval(Double($0)*86400)}.filter{$0<=bounds.upperBound}
        return HStack(spacing:8){
            VStack(alignment:.leading){Text("День").font(type(12));Picker("День",selection:Binding(get:{cityCalendar.startOfDay(for:time)},set:{d in
                let components=cityCalendar.dateComponents([.hour,.minute],from:time)
                var chosen=d.addingTimeInterval(Double((components.hour ?? 9)*60+(components.minute ?? 0))*60)
                if !bounds.contains(chosen) || !openAt(chosen) {chosen=max(d.addingTimeInterval(9*3600),bounds.lowerBound);if chosen>bounds.upperBound {chosen=d}}
                time=chosen
            })){ForEach(days,id:\.self){day in Text(cityCalendar.isDateInToday(day) ? "Сегодня":cityCalendar.isDateInTomorrow(day) ? "Завтра":day.formatted(.dateTime.day().month())).tag(day)}}.tint(.ink).frame(maxWidth:.infinity,minHeight:40).tile(.soft,10)}
            VStack(alignment:.leading){Text("Время").font(type(12));DatePicker("Время",selection:$time,displayedComponents:.hourAndMinute).labelsHidden().frame(maxWidth:.infinity,minHeight:40).tile(.soft,10)}
        }
    }
    func totalRow(_ name:String,_ value:Int)->some View {HStack{Text(name);Spacer();Text(rub(Double(value))).font(type(15,700))}}
    func heading(_ n:Int,_ title:String)->some View {HStack{Text("\(n)").font(type(12,700)).foregroundStyle(Color.surface).frame(width:24,height:24).background(Color.ink,in:Circle());Text(title).font(type(16,700))}.padding(.top,8)}
    func option(_ title:String,_ sub:String,_ selected:Bool,_ icon:String?=nil,action:@escaping ()->Void)->some View {Button(action:action){VStack(alignment:.leading,spacing:5){if let icon{Glyph(icon,22)};Text(title).font(type(14,700));if !sub.isEmpty{Text(sub).font(type(12))}}.padding(12).frame(maxWidth:.infinity,alignment:.leading).tile(selected ? .tintSoft:.surface,12).overlay(RoundedRectangle(cornerRadius:12).stroke(selected ? Color.accentBlue:Color.line))}}
    @MainActor func send() async {
        guard !sending else{return}
        if let e=addressError(a){error=e;return}
        guard !a.name.trimmingCharacters(in:.whitespaces).isEmpty,a.phone.filter(\.isNumber).count==11 else{error="Укажите имя и полный номер телефона.";return}
        if scheduled && (!deliveryRange().contains(time) || !openAt(time)) {error="Выберите время в часы работы, минимум за час до доставки.";return}
        if !scheduled && !openAt(Date()){scheduled=true;error="Выберите время доставки.";return}
        let lines=shop.lines
        guard !lines.isEmpty,lines.allSatisfy({$0.quantity<=shop.available($0.item)}) else{error="Проверьте наличие товаров в корзине.";return}
        sending=true;defer{sending=false}
        let id=String(Int(Date().timeIntervalSince1970))+String(format:"%05d",Int.random(in:0...99999))
        let fullAddress=a.street+(a.flat ? ", кв. "+a.apt:"")
        let receipt=Receipt(id:id,at:Date(),lines:lines,total:shop.total,address:fullAddress,pay:pay)
        let delivery=scheduled ? time.formatted(Date.FormatStyle(date:.abbreviated,time:.shortened,locale:Locale(identifier:"ru_RU"),timeZone:cityZone)) : "как можно скорее"
        let details=[a.zone,fullAddress,a.flat ? "Подъезд \(a.entrance), этаж \(a.floor), домофон \(a.code)" : "Частный дом",a.comment,leave ? "Оставить у двери":"",noCall ? "Не звонить в домофон":""].filter{!$0.isEmpty}.joined(separator:"\n")
        let products=lines.map{"\($0.item.name) · \(shop.storeName($0.item)) · \(amount($0.quantity,$0.item.kg)) × \(rub($0.item.price)) = \(rub(Double($0.sum)))"}.joined(separator:"\n")
        let message="Заказ №\(id)\n\(a.name)\n\(a.phone)\n\(details)\nВремя: \(delivery)\nОплата: \(pay) \(pay=="Наличными" ? change:"")\nНет товара: \(replacement)\n\(products)\nДоставка: \(rub(Double(shop.fee)))\nИтого: \(rub(Double(shop.total)))"
        do {
            try await transmitOrder(receipt,message:message,photos:a.photos)
            var next=shop.memory;var address=a;address.photos=shop.memory.address.photos;next.address=address;next.orders.insert(receipt,at:0);next.cart.removeAll();shop.memory=next;finished(id)
        }catch{self.error="Не удалось подтвердить отправку заказа. Проверьте подключение."}
    }
}
@MainActor private func transmitOrder(_ r:Receipt,message:String,photos:[Data]) async throws {
    let pictures=await withTaskGroup(of:(Int,Data?).self,returning:[Int:Data].self){ group in
        for l in r.lines {
            group.addTask {
                guard !l.item.photo.isEmpty,let url=URL(string:l.item.photo,relativeTo:URL(string:"https://prostoyy17.github.io/Dostavka/"))?.absoluteURL else{return (l.id,nil)}
                var request=URLRequest(url:url);request.timeoutInterval=4
                let bytes=try? await URLSession.shared.data(for:request).0
                return (l.id,bytes)
            }
        }
        var images:[Int:Data]=[:]
        for await (id,bytes) in group {images[id]=bytes}
        return images
    }
    let card=VStack(alignment:.leading,spacing:10){
        VStack(alignment:.leading,spacing:5){Text("Заказ №"+r.id).font(type(22,800));Text(r.address).font(type(14))}.foregroundStyle(.white).padding(16).frame(maxWidth:.infinity,alignment:.leading).background(Color(hex:"0033B0"))
        ForEach(r.lines){l in
            HStack{if let data=pictures[l.id],let image=UIImage(data:data){Image(uiImage:image).resizable().scaledToFit().frame(width:58,height:58)}
                VStack(alignment:.leading){Text(l.item.name).font(type(16,700));Text(amount(l.quantity,l.item.kg)+" × "+rub(l.item.price)).font(type(13))};Spacer();Text(rub(Double(l.sum))).font(type(15,700))
            }.padding(8)
        }
        Text("Итого: "+rub(Double(r.total))).font(type(20,800)).padding(12)
    }.frame(width:490,alignment:.leading).background(.white).foregroundStyle(.black)
    let renderer=ImageRenderer(content:card);renderer.scale=2
    guard let image=renderer.uiImage?.jpegData(compressionQuality:0.85) else{throw URLError(.cannotCreateFile)}
    let boundary=UUID().uuidString;var data=Data()
    func append(_ s:String){data.append(Data(s.utf8))}
    append("--\(boundary)\r\nContent-Disposition: form-data; name=\"message\"\r\n\r\n\(message)\r\n")
    for (i,photo) in ([image]+photos).enumerated(){append("--\(boundary)\r\nContent-Disposition: form-data; name=\"photo\"; filename=\"picture-\(i).jpg\"\r\nContent-Type: image/jpeg\r\n\r\n");data.append(photo);append("\r\n")}
    append("--\(boundary)--\r\n")
    var request=URLRequest(url:URL(string:"https://mayrmarket-order-test.zanyburl3.chatgpt.site/orders")!)
    request.httpMethod="POST";request.setValue("multipart/form-data; boundary="+boundary,forHTTPHeaderField:"Content-Type")
    #if DEBUG && targetEnvironment(simulator)
    if ProcessInfo.processInfo.arguments.contains("-RecordShopping") {return}
    #endif
    let (response,meta)=try await URLSession.shared.upload(for:request,from:data)
    guard let http=meta as? HTTPURLResponse,(200..<300).contains(http.statusCode),let receipt=try JSONSerialization.jsonObject(with:response) as? [String:Any],(receipt["received"] as? NSNumber)?.intValue ?? 0 > 0 else{throw URLError(.badServerResponse)}
}
