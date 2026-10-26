import {expect,test} from "@playwright/test";

test("single brand hides absent categories while category disables zero-count brands",async({page})=>{
  await page.route("**/api/auth/me",route=>route.fulfill({json:{user:{id:"catalog-user",firstName:"Иван",lastName:"Петров",email:"catalog@example.test",role:"user"}}}));
  await page.route("**/api/catalog?**",route=>{
    const query=new URL(route.request().url()).searchParams;
    const type=query.get("type"),single=query.get("brands")==="brand:fuga";
    return route.fulfill({json:{products:[],total:0,productBrands:[{id:"brand:fuga",name:"FUGA",count:type==="cabinet"?0:2},{id:"brand:norr møbler",name:"NORR Møbler",count:3},{id:"brand:leve home",name:"LEVE HOME",count:type==="cabinet"?4:0},{id:"brand:gomoon",name:"GoMoon",count:0}],categoryCounts:{sofa:2,armchair:1,cabinet:single?0:4,shoe_rack:single?0:2},categorySubtypes:{sofa:["Прямой"],armchair:["Кресло"]},unavailableSources:[]}});
  });
  await page.goto("/?catalog=furniture#студия");
  const catalog=page.getByRole("dialog",{name:"Каталог брендов партнеров"});
  await expect(catalog.getByRole("button",{name:/GoMoon 0 товаров/})).toBeDisabled();
  await expect(catalog.getByRole("button",{name:/LEVE HOME 0 товаров/})).toBeDisabled();
  await expect(catalog.getByRole("button",{name:/FUGA 2 товаров/})).toBeEnabled();
  await catalog.getByRole("button",{name:/FUGA 2 товаров/}).click();
  const types=catalog.locator(".room-catalog-types:not(.room-catalog-feature)");
  await types.locator("summary").click();
  await expect(catalog.getByRole("button",{name:"Обувница",exact:true})).toHaveCount(0);
  await expect(catalog.getByRole("button",{name:"Шкаф",exact:true})).toHaveCount(0);
  await expect(catalog.getByRole("button",{name:"Диван",exact:true})).toBeVisible();
  await expect(catalog.getByRole("button",{name:"Кресло",exact:true})).toBeVisible();
  await catalog.getByRole("button",{name:/Все бренды/}).click();
  await catalog.getByRole("button",{name:"Шкаф",exact:true}).click();
  await expect(catalog.getByRole("button",{name:/LEVE HOME 4 товаров/})).toBeEnabled();
  await expect(catalog.getByRole("button",{name:/FUGA 0 товаров/})).toBeDisabled();
});
