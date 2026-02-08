import { listQuizzes, genId, putQuiz, putTopic, putItem, touchQuiz, defaultSrs } from "./db.js";

export async function ensureSeed() {
  const quizzes = await listQuizzes();
  if (quizzes.length) return;

  const quizId = genId();
  const topicId = genId();

  await putQuiz(touchQuiz({
    id: quizId,
    title: "Spain provinces",
    createdAt: Date.now(),
    updatedAt: Date.now()
  }));

  await putTopic({
    id: topicId,
    quizId,
    title: "Mixed",
    order: 0
  });

  const samples = [
    { name:"Almería", flag:"https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/Flag_Almer%C3%ADa_Province.svg/1280px-Flag_Almer%C3%ADa_Province.svg.png" },
    { name:"Cádiz", flag:"https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/Flag_C%C3%A1diz_Province.svg/1280px-Flag_C%C3%A1diz_Province.svg.png" },
    { name:"Córdoba", flag:"https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/Provincia_de_C%C3%B3rdoba_-_Bandera.svg/1280px-Provincia_de_C%C3%B3rdoba_-_Bandera.svg.png" },
    { name:"Granada", flag:"https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Bandera_de_la_provincia_de_Granada_%28Espa%C3%B1a%29.svg/1280px-Bandera_de_la_provincia_de_Granada_%28Espa%C3%B1a%29.svg.png" },
    { name:"Huelva", flag:"https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Bandera_de_la_Provincia_De_Huelva.svg/1280px-Bandera_de_la_Provincia_De_Huelva.svg.png" },
    { name:"Jaén", flag:"https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Bandera_de_la_provincia_de_Ja%C3%A9n.svg/1280px-Bandera_de_la_provincia_de_Ja%C3%A9n.svg.png" },
    { name:"Málaga", flag:"https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Flag_M%C3%A1laga_Province.svg/1280px-Flag_M%C3%A1laga_Province.svg.png" },
    { name:"Seville", flag:"https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/Flag_of_Diputacion_de_Sevilla_Spain.svg/1280px-Flag_of_Diputacion_de_Sevilla_Spain.svg.png" },
    { name:"Huesca", flag:"https://upload.wikimedia.org/wikipedia/commons/thumb/1/1f/Flag_of_Huesca_%28province%29.svg/1280px-Flag_of_Huesca_%28province%29.svg.png" },
    { name:"Teruel", flag:"https://upload.wikimedia.org/wikipedia/commons/thumb/f/f7/Flag_of_Teruel_%28province%29.svg/1280px-Flag_of_Teruel_%28province%29.svg.png" },
    { name:"Zaragoza", flag:"https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/Flag_of_Zaragoza_province_%28with_coat_of_arms%29.svg/1280px-Flag_of_Zaragoza_province_%28with_coat_of_arms%29.svg.png" },
    { name:"Asturias", flag:"https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Flag_of_Asturias.svg/1280px-Flag_of_Asturias.svg.png" },
    { name:"Balearic Islands", flag:"https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Flag_of_the_Balearic_Islands.svg/1280px-Flag_of_the_Balearic_Islands.svg.png" },
    { name:"Álava", flag:"https://upload.wikimedia.org/wikipedia/commons/thumb/1/1f/Flag_of_%C3%81lava.svg/1280px-Flag_of_%C3%81lava.svg.png" },
    { name:"Biscay", flag:"https://upload.wikimedia.org/wikipedia/commons/thumb/0/00/Bandera_de_Vizcaya.svg/1280px-Bandera_de_Vizcaya.svg.png" },
    { name:"Gipuzkoa", flag:"https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/Flag_of_Guip%C3%BAzcoa.svg/1280px-Flag_of_Guip%C3%BAzcoa.svg.png" },
    { name:"Las Palmas", flag:"https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/Bandera_Provincial_de_Las_Palmas.svg/1280px-Bandera_Provincial_de_Las_Palmas.svg.png" },
    { name:"Santa Cruz de Tenerife", flag:"https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/Bandera_Provincial_de_Santa_Cruz_de_Tenerife.svg/1280px-Bandera_Provincial_de_Santa_Cruz_de_Tenerife.svg.png" },
    { name:"Cantabria", flag:"https://upload.wikimedia.org/wikipedia/commons/thumb/0/0f/Flag_of_Cantabria_%28Official%29.svg/1280px-Flag_of_Cantabria_%28Official%29.svg.png" },
    { name:"Ávila", flag:"https://upload.wikimedia.org/wikipedia/commons/thumb/5/54/Bandera_de_la_provincia_de_%C3%81vila.svg/1280px-Bandera_de_la_provincia_de_%C3%81vila.svg.png" },
    { name:"Burgos", flag:"https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/Flag_Burgos_Province.svg/1280px-Flag_Burgos_Province.svg.png" },
    { name:"León", flag:"https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/Bandera_de_Le%C3%B3n.svg/1280px-Bandera_de_Le%C3%B3n.svg.png" },
    { name:"Palencia", flag:"https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/Bandera_de_la_provincia_de_Palencia.svg/1280px-Bandera_de_la_provincia_de_Palencia.svg.png" },
    { name:"Salamanca", flag:"https://upload.wikimedia.org/wikipedia/commons/thumb/0/00/Bandera_de_la_provincia_de_Salamanca.svg/1280px-Bandera_de_la_provincia_de_Salamanca.svg.png" },
    { name:"Segovia", flag:"https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/Flag_Segovia_province.svg/1280px-Flag_Segovia_province.svg.png" },
    { name:"Soria", flag:"https://upload.wikimedia.org/wikipedia/commons/thumb/7/79/Flag_Soria_province.svg/1280px-Flag_Soria_province.svg.png" },
    { name:"Valladolid", flag:"https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Bandera_de_la_provincia_de_Valladolid.svg/1280px-Bandera_de_la_provincia_de_Valladolid.svg.png" },
    { name:"Zamora", flag:"https://www.banderasphonline.com/527-large_default/Array.jpg" },
    { name:"Albacete", flag:"https://upload.wikimedia.org/wikipedia/commons/thumb/d/d6/Bandera_provincia_Albacete.svg/1280px-Bandera_provincia_Albacete.svg.png" },
    { name:"Ciudad Real", flag:"https://upload.wikimedia.org/wikipedia/commons/thumb/3/37/Flag_Ciudad_Real_Province.svg/1280px-Flag_Ciudad_Real_Province.svg.png" },
    { name:"Cuenca", flag:"https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Flag_Cuenca_Province.svg/1280px-Flag_Cuenca_Province.svg.png" },
    { name:"Guadalajara", flag:"https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Flag_Guadalajara_Province.svg/1280px-Flag_Guadalajara_Province.svg.png" },
    { name:"Toledo", flag:"https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Bandera_antigua_de_la_provincia_de_Toledo.svg/1280px-Bandera_antigua_de_la_provincia_de_Toledo.svg.png" },
    { name:"Barcelona", flag:"https://upload.wikimedia.org/wikipedia/commons/thumb/d/dc/Flag_of_Barcelona_%28province%29.svg/1280px-Flag_of_Barcelona_%28province%29.svg.png" },
    { name:"Girona", flag:"https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Bandera_antiga_de_la_provincia_de_Girona.svg/1280px-Bandera_antiga_de_la_provincia_de_Girona.svg.png" },
    { name:"Lleida", flag:"https://upload.wikimedia.org/wikipedia/commons/thumb/8/86/Bandera_de_la_provincia_de_L%C3%A9rida1.svg/1280px-Bandera_de_la_provincia_de_L%C3%A9rida1.svg.png" },
    { name:"Tarragona", flag:"https://upload.wikimedia.org/wikipedia/commons/thumb/7/72/Bandera_actual_de_la_provincia_de_Tarragona_%28alternate%29.svg/1280px-Bandera_actual_de_la_provincia_de_Tarragona_%28alternate%29.svg.png" },
    { name:"Badajoz", flag:"https://upload.wikimedia.org/wikipedia/commons/8/8e/Bandera_y_Escudo_de_la_Provincia_de_Badajoz%2C_Espa%C3%B1a.jpg" },
    { name:"Cáceres", flag:"https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Flag_of_the_province_of_C%C3%A1ceres.svg/1280px-Flag_of_the_province_of_C%C3%A1ceres.svg.png" },
    { name:"A Coruña", flag:"https://banderasysoportes.com/wp-content/uploads/provincia-de-a-coru%C3%B1a.png" },
    { name:"Lugo", flag:"https://upload.wikimedia.org/wikipedia/commons/thumb/f/fb/Flag_of_Lugo_province.svg/1280px-Flag_of_Lugo_province.svg.png" },
    { name:"Ourense", flag:"https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Provincia_de_Ourense_-_Bandera.svg/1280px-Provincia_de_Ourense_-_Bandera.svg.png" },
    { name:"Pontevedra", flag:"https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Flag_Pontevedra_Province.svg/1280px-Flag_Pontevedra_Province.svg.png" },
    { name:"La Rioja", flag:"https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/Flag_of_La_Rioja_%28with_coat_of_arms%29.svg/1280px-Flag_of_La_Rioja_%28with_coat_of_arms%29.svg.png" },
    { name:"Madrid", flag:"https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Flag_of_the_Community_of_Madrid.svg/1280px-Flag_of_the_Community_of_Madrid.svg.png" },
    { name:"Murcia", flag:"https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Flag_of_the_Region_of_Murcia.svg/1280px-Flag_of_the_Region_of_Murcia.svg.png" },
    { name:"Navarre", flag:"https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Bandera_de_Navarra.svg/1280px-Bandera_de_Navarra.svg.png" },
    { name:"Alicante", flag:"https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/Alicante_%28provincia%29.svg/960px-Alicante_%28provincia%29.svg.png" },
    { name:"Castellón", flag:"https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Bandera_de_Castell%C3%B3_de_la_Plana-2.svg/1280px-Bandera_de_Castell%C3%B3_de_la_Plana-2.svg.png" },
    { name:"Valencia", flag:"https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Senyera_valenciana_de_l%27Estatut_de_Benic%C3%A0ssim.svg/250px-Senyera_valenciana_de_l%27Estatut_de_Benic%C3%A0ssim.svg.png" }
  ];

  for (const s of samples){
    await putItem({
      id: genId(),
      quizId,
      topicId,
      promptText: s.name,
      promptImage: s.flag,
      answerText: s.name,
      answerImage: s.flag,
      altAnswers: [s.name.toLowerCase()],
      tags: { country:"ES", subdivisionType:"province", script:"latin" },
      ...defaultSrs()
    });
  }
}
