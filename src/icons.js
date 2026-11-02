// src/icons.js — extracted verbatim from the original single-file app. Body is unchanged.
// ===== injected by scripts/wire.js — do not edit below this line in the header =====
    const MatIcon = ({ name, size = 24 }) => (
      <span className="material-symbols-outlined" style={{ fontSize: size, width: size, height: size }}>
        {name}
      </span>
    );

    const I = {
      Home: () => <MatIcon name="home" />,
      Profile: () => <MatIcon name="person" />,
      Circles: () => <MatIcon name="groups" />,
      DM: () => <MatIcon name="mail" />,
      Bell: () => <MatIcon name="notifications" />,
      Settings: () => <MatIcon name="settings" />,
      People: () => <MatIcon name="people" />,
      Search: () => <MatIcon name="search" />,
      Menu: () => <MatIcon name="menu" />,
      PlusOne: () => <MatIcon name="plus_one" size={20} />,
      Comment: () => <MatIcon name="chat_bubble_outline" size={20} />,
      Share: () => <MatIcon name="share" size={20} />,
      DarkMode: () => <MatIcon name="dark_mode" />,
      LightMode: () => <MatIcon name="light_mode" />,
      Close: () => <MatIcon name="close" />,
      Image: () => <MatIcon name="image" size={22} />,
      Music: () => <MatIcon name="music_note" size={22} />,
      Poll: () => <MatIcon name="poll" size={22} />,
      Gif: () => <MatIcon name="gif" size={22} />,
      Reply: () => <MatIcon name="reply" size={16} />,
      Pin: () => <MatIcon name="push_pin" size={16} />,
      Edit: () => <MatIcon name="edit" size={16} />,
      Trash: () => <MatIcon name="delete" size={16} />,
      Emoji: () => <MatIcon name="mood" size={16} />,
      Plus: () => <MatIcon name="add" size={20} />,
      Back: () => <MatIcon name="arrow_back" />,
      More: () => <MatIcon name="more_vert" size={20} />,
      Attach: () => <MatIcon name="attach_file" size={22} />,
      Send: () => <MatIcon name="send" size={22} />,
      Copy: () => <MatIcon name="content_copy" size={16} />,
      ExternalLink: () => <MatIcon name="open_in_new" size={16} />,
    };

export { MatIcon, I };
