import { describe, expect, it } from 'vitest';
import {
  buildPublishMessage,
  buildRadarCaption,
  displayCaption,
  hashtagsAlreadyInText,
  stripTrailingDuplicateHashtags,
  visibleHashtags,
} from './caption-hashtags';

describe('caption-hashtags', () => {
  const tags = ['#México', '#RadarMex', '#Tecnología', '#Samsung'];

  it('detecta hashtags ya presentes en el texto', () => {
    const text = 'Noticia\n\n#méxico #radarmex #tecnología #samsung\n\nhttps://example.com';
    expect(hashtagsAlreadyInText(text, tags)).toBe(true);
  });

  it('buildRadarCaption no duplica hashtags ni URL del copy', () => {
    const copy = `Texto principal

🔗 Más de esta noticia de México en:

#México #RadarMex #Tecnología #Samsung

https://www.radarmex.com/posts/ejemplo`;

    const caption = buildRadarCaption({
      copy,
      hashtags: tags,
      url: 'https://www.radarmex.com/posts/ejemplo',
    });

    expect(caption).toBe(copy);
    expect(caption.match(/#México/g)?.length).toBe(1);
  });

  it('buildRadarCaption agrega hashtags si el copy no los trae', () => {
    const caption = buildRadarCaption({
      copy: 'Solo texto',
      hashtags: ['#mx'],
      url: 'https://example.com/n1',
    });
    expect(caption).toContain('Solo texto');
    expect(caption).toContain('#mx');
    expect(caption).toContain('https://example.com/n1');
  });

  it('buildPublishMessage evita duplicar hashtags al publicar', () => {
    const caption = 'Post\n\n#mx #radar';
    expect(buildPublishMessage(caption, ['#mx', '#radar'])).toBe(caption);
    expect(buildPublishMessage('Post', ['#mx'])).toBe('Post\n\n#mx');
  });

  it('visibleHashtags oculta tags ya incluidos en caption', () => {
    expect(visibleHashtags('Hola #mx', ['#mx'])).toEqual([]);
    expect(visibleHashtags('Hola', ['#mx'])).toEqual(['#mx']);
  });

  it('stripTrailingDuplicateHashtags quita bloque final repetido', () => {
    const caption = `Texto

🔗 Más de esta noticia de México en:

#México #RadarMex #Tecnología #Samsung

https://example.com

#México #RadarMex #Tecnología #Samsung`;

    expect(stripTrailingDuplicateHashtags(caption, tags)).toBe(`Texto

🔗 Más de esta noticia de México en:

#México #RadarMex #Tecnología #Samsung

https://example.com`);
  });

  it('displayCaption limpia duplicados para la UI', () => {
    const raw = `Post\n\n#mx\n\n#mx`;
    expect(displayCaption(raw, ['#mx'])).toBe('Post\n\n#mx');
  });
});
