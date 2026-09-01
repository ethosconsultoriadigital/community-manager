import { describe, expect, it } from 'vitest';
import {
  buildPublishMessage,
  buildRadarCaption,
  dedupeHashtagsKeepLast,
  displayCaption,
  hashtagsAlreadyInText,
  normalizeCaptionHashtags,
  visibleHashtags,
} from './caption-hashtags';

describe('caption-hashtags', () => {
  const tags = ['#México', '#RadarMex', '#Tecnología', '#Samsung'];

  const duplicatedCaption = `¿Buscas un smartphone que valga cada peso?

🔗 Más de esta noticia de México en:

#México #RadarMex #Tecnología #Samsung

https://www.radarmex.com/posts/ejemplo

#México #RadarMex #Tecnología #Samsung`;

  const expectedNormalized = `¿Buscas un smartphone que valga cada peso?

🔗 Más de esta noticia de México en:

https://www.radarmex.com/posts/ejemplo

#México #RadarMex #Tecnología #Samsung`;

  it('detecta hashtags ya presentes en el texto', () => {
    const text = 'Noticia\n\n#méxico #radarmex #tecnología #samsung\n\nhttps://example.com';
    expect(hashtagsAlreadyInText(text, tags)).toBe(true);
  });

  it('dedupeHashtagsKeepLast elimina el bloque intermedio y conserva el final', () => {
    expect(dedupeHashtagsKeepLast(duplicatedCaption, tags)).toBe(expectedNormalized);
  });

  it('normalizeCaptionHashtags mueve hashtags al final del post', () => {
    const onlyMiddle = `Texto

🔗 Más de esta noticia de México en:

#México #RadarMex #Tecnología #Samsung

https://www.radarmex.com/posts/ejemplo`;

    expect(normalizeCaptionHashtags(onlyMiddle, tags)).toBe(expectedNormalized.replace(
      '¿Buscas un smartphone que valga cada peso?',
      'Texto',
    ));
  });

  it('buildRadarCaption coloca hashtags solo al final', () => {
    const copy = `Texto principal

🔗 Más de esta noticia de México en:

#México #RadarMex #Tecnología #Samsung

https://www.radarmex.com/posts/ejemplo`;

    const caption = buildRadarCaption({
      copy,
      hashtags: tags,
      url: 'https://www.radarmex.com/posts/ejemplo',
    });

    expect(caption).toBe(`Texto principal

🔗 Más de esta noticia de México en:

https://www.radarmex.com/posts/ejemplo

#México #RadarMex #Tecnología #Samsung`);
    expect(caption.match(/#México/g)?.length).toBe(1);
  });

  it('buildRadarCaption agrega hashtags al final si el copy no los trae', () => {
    const caption = buildRadarCaption({
      copy: 'Solo texto',
      hashtags: ['#mx'],
      url: 'https://example.com/n1',
    });
    expect(caption).toBe(`Solo texto

https://example.com/n1

#mx`);
  });

  it('buildPublishMessage no duplica hashtags al publicar', () => {
    expect(buildPublishMessage(expectedNormalized, tags)).toBe(expectedNormalized);
    expect(buildPublishMessage('Post', ['#mx'])).toBe('Post\n\n#mx');
  });

  it('visibleHashtags oculta tags ya incluidos en caption', () => {
    expect(visibleHashtags(expectedNormalized, tags)).toEqual([]);
    expect(visibleHashtags('Hola', ['#mx'])).toEqual([]);
  });

  it('displayCaption limpia duplicados para la UI', () => {
    expect(displayCaption(duplicatedCaption, tags)).toBe(expectedNormalized);
  });
});
